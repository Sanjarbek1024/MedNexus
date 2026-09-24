"""Worklist triage, batch processing, prior comparison, training mode and dashboards."""

from collections.abc import Callable
from pathlib import Path

from fastapi.testclient import TestClient

from app.analyzers.base import Level
from app.db.models import Priority, Role
from app.schemas import FindingOut
from app.services.triage import prioritize
from tests.conftest import upload, wait_for

URGENT = {"Pneumothorax", "Effusion", "Fracture"}


def finding(name: str, score: float, level: Level) -> FindingOut:
    return FindingOut(name=name, score=score, level=level, model_scores={}, models_agree=True)


def test_triage_rules() -> None:
    assert prioritize([finding("Pneumothorax", 0.81, Level.HIGH)], URGENT) == (Priority.URGENT, "Pneumothorax 0.81")
    assert prioritize([finding("Effusion", 0.55, Level.UNCERTAIN)], URGENT)[0] is Priority.ATTENTION
    assert prioritize([finding("Nodule", 0.66, Level.MODERATE)], URGENT)[0] is Priority.ATTENTION
    assert prioritize([finding("Nodule", 0.52, Level.UNCERTAIN)], URGENT) == (Priority.ROUTINE, None)
    assert prioritize([], URGENT) == (Priority.ROUTINE, None)


def test_worklist_puts_urgent_open_cases_first(make_user: Callable[[str], TestClient], sample: Callable[[str], Path]) -> None:
    doctor = make_user(Role.RADIOLOGIST)
    normal = upload(doctor, sample("chest_pa_normal.jpg")).json()
    pneumonia = upload(doctor, sample("chest_pa_pneumonia.jpg")).json()
    assert pneumonia["priority"] == "urgent" and "Consolidation" in pneumonia["priority_reason"]
    assert normal["priority"] == "routine"

    items = doctor.get("/api/cases").json()["items"]
    assert [c["id"] for c in items][:2] == [pneumonia["case_id"], normal["case_id"]]

    doctor.post(f"/api/cases/{pneumonia['case_id']}/review", json={"action": "confirm"})
    items = doctor.get("/api/cases").json()["items"]
    assert items[-1]["id"] == pneumonia["case_id"]  # reviewed cases sink to the bottom
    assert items[-1]["status"] == "reviewed" and items[-1]["reviewer"]

    assert [c["id"] for c in doctor.get("/api/cases?group=reviewed").json()["items"]] == [pneumonia["case_id"]]
    assert doctor.get("/api/cases?priority=urgent&group=open").json()["total"] == 0
    found = doctor.get("/api/cases", params={"q": normal["patient"]["pseudonym"]}).json()["items"]
    assert [c["id"] for c in found] == [normal["case_id"]]


def test_batch_upload_is_analyzed_in_the_background(client: TestClient, sample: Callable[[str], Path]) -> None:
    files = [
        ("files", (name, sample(name).read_bytes(), "application/octet-stream"))
        for name in ("chest_pa_normal_2.png", "chest_nih_00000001_000.png")
    ] + [("files", ("notes.txt", b"not an image", "text/plain"))]
    response = client.post(
        "/api/cases/batch", files=files,
        data={"modality": "xray", "region": "chest", "view": "PA", "language": "en"},
    )
    assert response.status_code == 202
    body = response.json()
    assert len(body["queued"]) == 2 and body["rejected"][0]["file"] == "notes.txt"
    for case in body["queued"]:
        assert case["status"] in ("queued", "analyzing", "ai_ready")
        assert wait_for(client, case["id"])["status"] == "ai_ready"


def test_report_draft_then_sign_off(client: TestClient, sample: Callable[[str], Path]) -> None:
    case_id = upload(client, sample("chest_pa_pneumonia.jpg")).json()["case_id"]
    sections = {"findings": "RUL airspace opacity.", "impression": "Right upper lobe pneumonia.", "recommendations": "Follow-up in 6 weeks."}
    draft = client.put(f"/api/cases/{case_id}/report/draft", json=sections).json()
    assert draft["physician_report"]["status"] == "draft" and draft["status"] == "ai_ready"

    signed = client.post(f"/api/cases/{case_id}/review", json={"action": "confirm"}).json()
    assert signed["physician_report"] | {"author": None, "updated_at": None, "signed_at": None} == sections | {
        "status": "final", "author": None, "updated_at": None, "signed_at": None,
    }
    assert signed["physician_report"]["signed_at"]
    assert client.put(f"/api/cases/{case_id}/report/draft", json=sections).status_code == 409


def test_prior_comparison(client: TestClient, sample: Callable[[str], Path]) -> None:
    prior = upload(client, sample("chest_pa_normal.jpg"), acquired_on="2026-03-01").json()
    current = upload(
        client, sample("chest_pa_pneumonia.jpg"), acquired_on="2026-09-01", patient_id=str(prior["patient"]["id"])
    ).json()
    assert current["patient"] == prior["patient"]

    patients = client.get("/api/patients?min_cases=2").json()
    assert prior["patient"]["id"] in [p["id"] for p in patients]

    # Order does not matter: the earlier acquisition is always the prior.
    body = client.post("/api/compare", json={"prior_id": current["case_id"], "current_id": prior["case_id"]}).json()
    assert body["prior"]["case_id"] == prior["case_id"] and body["interval_days"] == 184.0
    consolidation = next(d for d in body["deltas"] if d["name"] == "Consolidation")
    assert consolidation["trend"] == "new" and consolidation["change"] > 0
    assert body["deltas"][0]["reported"]
    assert body["summary"] is None and body["summary_error"]

    other = upload(client, sample("chest_pa_heart_failure.jpg")).json()
    mismatch = client.post("/api/compare", json={"prior_id": prior["case_id"], "current_id": other["case_id"]})
    assert mismatch.status_code == 422


def test_training_blind_read(make_user: Callable[[str], TestClient], sample: Callable[[str], Path]) -> None:
    doctor, resident = make_user(Role.RADIOLOGIST), make_user(Role.RESIDENT)
    case = upload(doctor, sample("chest_pa_heart_failure.jpg")).json()
    ai = [f["name"] for f in case["findings"]]
    doctor.post(f"/api/cases/{case['case_id']}/review", json={
        "action": "edit", "report": {"impression": "Congestive heart failure."},
        "finding_decisions": {ai[-1]: "disagree"}, "added_findings": ["Edema"],
    })

    task = None
    for _ in range(50):  # the pool is shared; find this case
        task = resident.get("/api/training/next").json()
        if task["case_id"] == case["case_id"]:
            break
    assert task["case_id"] == case["case_id"]
    assert "findings" not in task and "Edema" in task["candidates"]

    reveal = resident.post(f"/api/training/{task['case_id']}/attempt", json={
        "selected": ["Edema", ai[0]], "marks": [{"x": 0.4, "y": 0.5}],
    }).json()
    reference = sorted(set(ai[:-1]) | {"Edema"})
    assert reveal["reference"] == reference
    assert reveal["ai_was_wrong"] is True
    assert reveal["impression"] == "Congestive heart failure."
    expected = 100 * 2 / len(reference)  # two true positives, no false positives
    assert reveal["score"] == round(expected, 1)

    stats = resident.get("/api/training/stats").json()
    assert stats["attempts"] == 1
    edema = next(p for p in stats["per_pathology"] if p["name"] == "Edema")
    assert edema["sensitivity"] == 1.0

    mistakes = resident.get("/api/training/ai-mistakes").json()
    mistake = next(m for m in mistakes if m["case_id"] == case["case_id"])
    assert mistake["missed_by_ai"] == ["Edema"] and mistake["false_alarms"] == [ai[-1]]


def test_dashboard_and_safety_monitor(make_user: Callable[[str], TestClient], sample: Callable[[str], Path]) -> None:
    doctor, admin = make_user(Role.RADIOLOGIST), make_user(Role.ADMIN)
    case = upload(doctor, sample("chest_pa_pneumonia.jpg")).json()
    upload(doctor, sample("hand_xray.jpg"))
    names = [f["name"] for f in case["findings"]]
    doctor.post(f"/api/cases/{case['case_id']}/review", json={
        "action": "edit", "report": {"impression": "Pneumonia."}, "finding_decisions": {names[-1]: "disagree"},
    })

    dashboard = doctor.get("/api/stats/dashboard?tz_offset=-300").json()
    assert dashboard["reviewed_today"] == 1 and dashboard["queued_today"] == 2
    assert dashboard["avg_turnaround_minutes"] is not None
    assert dashboard["agreement_rate"] == round((len(names) - 1) / len(names), 3)
    assert len(dashboard["daily"]) == 7 and dashboard["daily"][-1]["uploaded"] == 2

    safety = admin.get("/api/stats/safety").json()
    assert safety["rejected_images"] >= 1 and "reconstruction" in safety["rejection_reasons"]
    assert any(p["name"] == names[-1] and p["disagree"] >= 1 for p in safety["per_pathology"])
    assert len(safety["weekly"]) == 8
