"""v1 behaviour, now behind authentication: analyze, stream, review, audit."""

import json
from collections.abc import Callable
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import upload


def test_health_is_public(app_client: TestClient) -> None:
    body = TestClient(app).get("/api/health").json()
    assert body["status"] == "ok"
    assert body["database"] in {"sqlite", "postgresql"}
    assert {a["id"] for a in body["analyzers"]} >= {"chest_xray_pathology", "chest_xray_ood"}
    assert body["llm"]["configured"] is False


def test_capabilities_mark_only_validated_combinations_as_supported(app_client: TestClient) -> None:
    body = TestClient(app).get("/api/capabilities").json()
    xray, ct, mri = body["modalities"]
    chest = next(r for r in xray["regions"] if r["id"] == "chest")
    assert {v["id"]: v["supported"] for v in chest["views"]} == {"PA": True, "AP": True, "Lateral": False}
    assert not ct["supported"] and not mri["supported"]
    assert body["default_language"] == "uz"


def test_analysis_requires_sign_in(app_client: TestClient, sample: Callable[[str], Path]) -> None:
    response = upload(TestClient(app), sample("chest_pa_normal.jpg"))
    assert response.status_code in (401, 403)


def test_unsupported_study_type_is_refused(client: TestClient, sample: Callable[[str], Path]) -> None:
    assert upload(client, sample("chest_pa_normal.jpg"), view="Lateral").status_code == 422


def test_rejected_image_returns_no_findings(client: TestClient, sample: Callable[[str], Path]) -> None:
    body = upload(client, sample("hand_xray.jpg")).json()
    assert body["status"] == "image_rejected"
    assert body["findings"] == [] and body["report"] is None
    assert body["rejection_reasons"]


def test_analysis_streams_progress_then_result(client: TestClient, sample: Callable[[str], Path]) -> None:
    response = upload(client, sample("chest_pa_pneumonia.jpg"), stream=True)
    events = [
        (block.split("\n")[0].removeprefix("event: "), json.loads(block.split("\n")[1][6:]))
        for block in response.text.strip().split("\n\n")
    ]
    stages = [data["stage"] for name, data in events if name == "progress"]
    assert stages[0] == "quality" and stages[-1] == "report"
    assert "explainability" in stages
    name, result = events[-1]
    assert name == "result"
    assert result["status"] == "ai_ready"
    assert result["patient"]["pseudonym"].startswith("PX-")
    assert result["findings"][0]["heatmap"]["url"].startswith("data:image/png;base64,")
    assert len(result["structures"]) == 3
    assert result["suggested_report"]["findings"].startswith("• Consolidation")
    # Without an API key the report falls back to model results only.
    assert result["report"] is None and result["report_error"]
    grounding = next(c for c in result["checks"] if c["id"] == "report_grounding")
    assert grounding["status"] == "warn" and grounding["code"] == "report_unavailable"


def test_review_flow_is_audited(client: TestClient, sample: Callable[[str], Path]) -> None:
    case = upload(client, sample("chest_pa_heart_failure.jpg")).json()
    case_id = case["case_id"]
    names = [f["name"] for f in case["findings"]]

    refused = client.post(f"/api/cases/{case_id}/review", json={"action": "reject"})
    assert refused.status_code == 422  # rejecting requires a reason

    edited = client.post(f"/api/cases/{case_id}/review", json={
        "action": "edit",
        "report": {"findings": "Bilateral opacities.", "impression": "Pulmonary edema.", "recommendations": "Echo."},
        "finding_decisions": {names[0]: "agree", names[-1]: "disagree"},
        "added_findings": ["Edema"],
        "notes": "Edema missed by the AI.",
    }).json()
    assert edited["status"] == "reviewed"
    assert edited["physician_report"]["status"] == "final"
    assert edited["physician_report"]["impression"] == "Pulmonary edema."
    assert edited["review"]["added_findings"] == ["Edema"]
    assert edited["review"]["finding_decisions"][names[-1]] == "disagree"
    assert [e["action"] for e in edited["audit"]] == [
        "case_uploaded", "analysis_created", "report_generated", "review_edit",
    ]
    assert client.get("/api/audit/verify").json()["valid"] is True


def test_rejected_image_cannot_be_reviewed(client: TestClient, sample: Callable[[str], Path]) -> None:
    case_id = upload(client, sample("photo_kitten.jpg")).json()["case_id"]
    response = client.post(f"/api/cases/{case_id}/review", json={"action": "confirm"})
    assert response.status_code == 409


def test_unknown_case_returns_404(client: TestClient) -> None:
    assert client.get("/api/cases/999999").status_code == 404
