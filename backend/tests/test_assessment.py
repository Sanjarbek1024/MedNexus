import json
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.db.models import Role
from app.main import app
from app.services.assessment import MAX_PROBABILITY, _clean
from app.services.hospitals import recommend
from tests.conftest import upload

ANSWER = {
    "summary": "The image and the cough suggest a lung infection.",
    "image_observations": ["Hazy area in the right upper lung"],
    "differential": [
        {"name": "Pneumonia", "probability": 70, "reasoning": "Consolidation with fever"},
        {"name": "Normal variant", "probability": 20, "reasoning": "Low scores elsewhere"},
    ],
    "causes": ["Bacterial infection"],
    "urgency": "soon",
    "urgency_text": "See a doctor within a few days.",
    "next_steps": ["Visit a pulmonologist"],
    "questions_for_doctor": ["Do I need antibiotics?"],
    "specialty": "pulmonology",
}


class FakeVision:
    """Stands in for the Groq client of the vision-language model and records the request."""

    def __init__(self, answer: dict | Exception) -> None:
        self.answer = answer
        self.calls: list[dict] = []
        self.chat = SimpleNamespace(completions=self)

    def create(self, **kwargs: object):
        self.calls.append(kwargs)
        if isinstance(self.answer, Exception):
            raise self.answer
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(self.answer)))])


def with_vision(fake: FakeVision, action: Callable[[], object]) -> object:
    vision = app.state.service.vision
    vision._client = fake
    try:
        return action()
    finally:
        vision._client = None


def test_estimates_are_never_certain() -> None:
    raw = {
        **ANSWER,
        "differential": [
            {"name": "A", "probability": 100},
            {"name": "B", "probability": 60},
            {"name": "C", "probability": "n/a"},
            {"name": "", "probability": 10},
        ],
        "urgency": "panic",
        "specialty": "astrology",
    }
    assessment = _clean(raw, "patient", "uz", "vision-model")
    probabilities = [d.probability for d in assessment.differential]
    assert [d.name for d in assessment.differential] == ["A", "B"]
    assert max(probabilities) <= MAX_PROBABILITY and sum(probabilities) <= 100
    assert (assessment.urgency, assessment.specialty) == ("soon", "general")
    assert "100%" in assessment.disclaimer  # written by the app, not the model


def test_partner_hospitals_come_first_and_emergency_when_urgent() -> None:
    routine = recommend("neurosurgery")
    assert routine[0].partner and "neurosurgery" in routine[1].specialties
    assert recommend("pulmonology", "urgent")[1].emergency
    assert recommend("unknown-specialty")[0].partner


def test_users_get_a_plain_language_assessment(make_user: Callable[[str], TestClient], sample: Callable[[str], Path]) -> None:
    person = make_user(Role.USER)
    fake = FakeVision(ANSWER)
    body = with_vision(fake, lambda: upload(
        person, sample("chest_pa_pneumonia.jpg"), symptoms="Cough and fever", age="40", sex="female"
    ).json())

    assessment = body["assessment"]
    assert assessment["audience"] == "patient" and assessment["differential"][0]["name"] == "Pneumonia"
    assert body["hospitals"][0]["partner"] and "pulmonology" in body["hospitals"][1]["specialties"]

    request = fake.calls[0]
    system, content = request["messages"][0]["content"], request["messages"][1]["content"]
    assert "ordinary person" in system and "English" in system
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")  # the model sees the image
    assert "Cough and fever" in content[0]["text"] and '"Consolidation"' in content[0]["text"]


def test_doctors_get_a_clinical_assessment_and_can_regenerate(client: TestClient, sample: Callable[[str], Path]) -> None:
    fake = FakeVision(ANSWER)
    case_id = with_vision(fake, lambda: upload(client, sample("chest_pa_pneumonia.jpg")).json())["case_id"]
    assert "physician" in fake.calls[0]["messages"][0]["content"]

    again = with_vision(fake, lambda: client.post(f"/api/cases/{case_id}/assessment", json={"language": "ru"}))
    assert again.status_code == 200 and again.json()["assessment"]["language"] == "ru"
    assert "Russian" in fake.calls[1]["messages"][0]["content"]


def test_assessment_failure_keeps_the_case_usable(client: TestClient, sample: Callable[[str], Path]) -> None:
    body = with_vision(FakeVision(RuntimeError("upstream down")), lambda: upload(client, sample("chest_pa_pneumonia.jpg")).json())
    assert body["status"] == "ai_ready" and body["findings"]
    assert body["assessment"] is None and body["assessment_error"]
