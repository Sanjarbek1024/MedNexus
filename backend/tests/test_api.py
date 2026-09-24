import json
from collections.abc import Callable
from pathlib import Path

from fastapi.testclient import TestClient


def post_study(
    client: TestClient, path: Path, view: str = "PA", headers: dict | None = None
):
    with path.open("rb") as handle:
        return client.post(
            "/api/analyze",
            files={"file": (path.name, handle, "application/octet-stream")},
            data={"modality": "xray", "region": "chest", "view": view, "language": "en"},
            headers=headers or {},
        )


def test_health(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["device"] in {"cpu", "cuda"}
    assert {a["id"] for a in body["analyzers"]} >= {"chest_xray_pathology", "chest_xray_ood"}
    assert body["llm"]["configured"] is False


def test_capabilities_mark_only_frontal_chest_xray_as_supported(client: TestClient) -> None:
    body = client.get("/api/capabilities").json()
    xray, ct, mri = body["modalities"]
    chest = next(r for r in xray["regions"] if r["id"] == "chest")
    assert {v["id"]: v["supported"] for v in chest["views"]} == {
        "PA": True, "AP": True, "Lateral": False,
    }
    assert not any(r["supported"] for r in xray["regions"] if r["id"] != "chest")
    assert not ct["supported"] and not mri["supported"]
    assert body["default_language"] == "uz"


def test_unsupported_study_type_is_refused(client: TestClient, sample: Callable[[str], Path]) -> None:
    response = post_study(client, sample("chest_pa_normal.jpg"), view="Lateral")
    assert response.status_code == 422


def test_non_image_upload_is_refused(client: TestClient) -> None:
    response = client.post(
        "/api/analyze",
        files={"file": ("notes.txt", b"not an image", "text/plain")},
        data={"modality": "xray", "region": "chest", "view": "PA"},
    )
    assert response.status_code == 415


def test_rejected_image_returns_no_findings(client: TestClient, sample: Callable[[str], Path]) -> None:
    body = post_study(client, sample("hand_xray.jpg")).json()
    assert body["status"] == "image_rejected"
    assert body["findings"] == [] and body["report"] is None
    assert body["rejection_reasons"]


def test_analysis_streams_progress_then_result(
    client: TestClient, sample: Callable[[str], Path]
) -> None:
    response = post_study(
        client, sample("chest_pa_pneumonia.jpg"), headers={"Accept": "text/event-stream"}
    )
    events = [
        (block.split("\n")[0].removeprefix("event: "), json.loads(block.split("\n")[1][6:]))
        for block in response.text.strip().split("\n\n")
    ]
    stages = [data["stage"] for name, data in events if name == "progress"]
    assert stages[0] == "quality" and stages[-1] == "report"
    assert "explainability" in stages
    name, result = events[-1]
    assert name == "result"
    assert result["status"] == "draft"
    assert result["findings"][0]["heatmap"]["url"].startswith("data:image/png;base64,")
    assert len(result["structures"]) == 3
    # Without an API key the report falls back to model results only.
    assert result["report"] is None and result["report_error"]
    grounding = next(c for c in result["checks"] if c["id"] == "report_grounding")
    assert grounding["status"] == "warn"


def test_review_flow_is_audited(client: TestClient, sample: Callable[[str], Path]) -> None:
    case = post_study(client, sample("chest_pa_heart_failure.jpg")).json()
    case_id = case["case_id"]
    assert case["status"] == "draft"

    refused = client.post(f"/api/cases/{case_id}/review", json={"action": "reject", "reviewer": "Dr. A"})
    assert refused.status_code == 422  # rejecting requires a reason

    edited = client.post(
        f"/api/cases/{case_id}/review",
        json={"action": "edit", "reviewer": "Dr. A", "final_impression": "Cardiomegaly, edema."},
    ).json()
    assert edited["status"] == "edited"
    assert edited["review"]["final_impression"] == "Cardiomegaly, edema."
    assert [e["action"] for e in edited["audit"]] == [
        "analysis_created", "report_generated", "review_edit",
    ]

    listed = client.get("/api/cases").json()
    assert listed["items"][0]["id"] == case_id
    assert listed["items"][0]["reviewer"] == "Dr. A"
    assert client.get("/api/audit/verify").json()["valid"] is True


def test_rejected_image_cannot_be_reviewed(client: TestClient, sample: Callable[[str], Path]) -> None:
    case_id = post_study(client, sample("photo_kitten.jpg")).json()["case_id"]
    response = client.post(
        f"/api/cases/{case_id}/review", json={"action": "confirm", "reviewer": "Dr. A"}
    )
    assert response.status_code == 409


def test_unknown_case_returns_404(client: TestClient) -> None:
    assert client.get("/api/cases/999999").status_code == 404
