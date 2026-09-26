"""Clinical-first cases: the rules engine, symptoms-only differential, safety critic, attaching imaging."""

import json
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import ClinicalData, Vitals
from app.services.clinical_rules import evaluate, news2, qsofa

from .conftest import upload

SEPSIS = ClinicalData(
    chief_complaint="Fever and confusion",
    symptoms=["fever", "confusion"],
    vitals=Vitals(temperature=39.4, heart_rate=128, resp_rate=26, systolic=88, diastolic=50, spo2=91, consciousness="confused"),
)
WELL = ClinicalData(
    chief_complaint="Mild sore throat",
    vitals=Vitals(temperature=37.1, heart_rate=76, resp_rate=14, systolic=122, diastolic=78, spo2=98),
)

DRAFT = {
    "summary": "Community-acquired pneumonia is most likely.",
    "image_observations": ["should be dropped"],
    "differential": [
        {"name": "Community-acquired pneumonia", "probability": 70, "reasoning": "Fever, cough, crackles.",
         "evidence_for": ["Symptom: productive cough", "Vitals: fever 38.9 °C"], "confirm_with": ["Chest X-ray"]},
        {"name": "Acute bronchitis", "probability": 20, "reasoning": "Cough without hypoxia."},
    ],
    "red_flags": [],
    "urgency": "routine",
    "urgency_text": "Routine follow-up is sufficient.",
    "specialty": "pulmonology",
}
CRITIC = {"add": [{"name": "Sepsis", "reason": "qSOFA is 3.", "confirm_with": ["Lactate"]}], "notes": ["Hypotension ignored."], "urgency": "urgent"}


class FakeLLM:
    """Answers the reasoner first, then the safety critic."""

    def __init__(self, *answers: dict) -> None:
        self.answers = list(answers)
        self.calls: list[dict] = []
        self.chat = SimpleNamespace(completions=self)

    def create(self, **kwargs: object):
        self.calls.append(kwargs)
        answer = self.answers.pop(0) if self.answers else {"add": [], "notes": []}
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(answer)))])


def with_reasoner(fake: FakeLLM, action: Callable[[], object]) -> object:
    llm = app.state.service.writer.llm
    llm._client = fake
    try:
        return action()
    finally:
        llm._client = None


def clinical_case(client: TestClient, data: ClinicalData, **form: str):
    return client.post("/api/analyze", data={"clinical": data.model_dump_json(), "language": "en", **form})


def test_news2_and_qsofa_follow_the_published_tables() -> None:
    score = news2(SEPSIS)
    # RR 26 → 3, SpO2 91 → 3, SBP 88 → 3, HR 128 → 2, T 39.4 → 2, confused → 3
    assert score.value == 16 and score.band == "high" and not score.partial
    assert qsofa(SEPSIS).value == 3 and qsofa(SEPSIS).band == "high"
    assert news2(WELL).value == 0 and news2(WELL).band == "low"
    assert news2(ClinicalData(vitals=Vitals(heart_rate=80))) is None  # too little to score honestly


def test_rules_drive_triage_and_red_flags() -> None:
    rules = evaluate(SEPSIS, 70)
    assert rules.priority == "urgent" and rules.urgency_floor == "urgent"
    codes = {f.code for f in rules.flags}
    assert {"hypotension", "spo2_low", "altered_consciousness", "symptom_confusion"} <= codes
    crb = next(s for s in rules.scores if s.name == "CRB-65")
    assert crb.value == 3  # confusion + low blood pressure + age ≥ 65 (RR 26 is below 30)
    assert evaluate(WELL, 30).priority == "routine"


def test_symptoms_only_case_without_llm_still_triages(client: TestClient) -> None:
    body = clinical_case(client, SEPSIS, age="70", sex="male").json()
    assert body["has_image"] is False and body["status"] == "ai_ready"
    assert body["priority"] == "urgent" and body["rules"]["scores"][0]["name"] == "NEWS2"
    assert body["assessment"] is None and "GROQ_API_KEY" in body["assessment_error"]
    listed = next(c for c in client.get("/api/cases").json()["items"] if c["id"] == body["case_id"])
    assert listed["has_image"] is False and listed["chief_complaint"] == "Fever and confusion"


def test_symptoms_only_differential_with_critic_and_guardrails(client: TestClient) -> None:
    fake = FakeLLM(DRAFT, CRITIC)
    body = with_reasoner(fake, lambda: clinical_case(client, SEPSIS, age="70").json())
    assessment = body["assessment"]
    assert assessment["mode"] == "clinical" and assessment["image_observations"] == []
    names = [d["name"] for d in assessment["differential"]]
    assert "Sepsis" in names and next(d for d in assessment["differential"] if d["name"] == "Sepsis")["cannot_miss"]
    assert assessment["urgency"] == "urgent"  # the rules floor and the critic both raise it
    assert assessment["critic_notes"] == ["Hypotension ignored."]
    assert [s["id"] for s in assessment["pipeline"]] == ["rules", "imaging", "reasoner", "critic", "guardrails"]
    assert body["case_id"] and client.get(f"/api/cases/{body['case_id']}").json()["assessment"]["mode"] == "clinical"
    reasoner_prompt = fake.calls[0]["messages"][0]["content"]
    assert "There is NO\nimage" in reasoner_prompt and "Fever and confusion" in fake.calls[0]["messages"][1]["content"]


def test_empty_intake_is_refused(client: TestClient) -> None:
    assert client.post("/api/analyze", data={"language": "en"}).status_code == 422
    assert client.post("/api/analyze", data={"clinical": "{not json", "language": "en"}).status_code == 422


def test_imaging_can_be_attached_later(client: TestClient, sample: Callable[[str], Path]) -> None:
    case_id = clinical_case(client, WELL).json()["case_id"]
    path = sample("chest_pa_normal.jpg")
    with path.open("rb") as handle:
        response = client.post(
            f"/api/cases/{case_id}/imaging",
            files={"file": (path.name, handle, "application/octet-stream")},
            data={"modality": "xray", "region": "chest", "view": "PA"},
        )
    body = response.json()
    assert response.status_code == 200 and body["has_image"] and body["status"] == "ai_ready"
    assert body["clinical"]["chief_complaint"] == "Mild sore throat"
    with path.open("rb") as handle:  # a second image is refused
        again = client.post(
            f"/api/cases/{case_id}/imaging",
            files={"file": (path.name, handle, "application/octet-stream")},
            data={"modality": "xray", "region": "chest", "view": "PA"},
        )
    assert again.status_code == 409


def test_image_case_keeps_the_intake(client: TestClient, sample: Callable[[str], Path]) -> None:
    body = upload(client, sample("chest_pa_normal.jpg"), clinical=SEPSIS.model_dump_json(), age="70").json()
    assert body["has_image"] and body["clinical"]["vitals"]["spo2"] == 91
    assert body["priority"] == "urgent"  # the rules engine raises triage even when the image is normal
