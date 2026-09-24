"""The extremity fracture analyzer (a second model family plugged into the same registry)."""

from collections.abc import Callable
from pathlib import Path

from fastapi.testclient import TestClient

from app.analyzers.base import AnalysisContext
from app.imaging import decode_upload
from tests.conftest import upload


def detector(client: TestClient):  # noqa: ANN201
    return next(a for a in client.app.state.registry.analyzers if a.id == "extremity_fracture")


def test_extremity_becomes_selectable(client: TestClient) -> None:
    xray = client.get("/api/capabilities").json()["modalities"][0]
    extremity = next(r for r in xray["regions"] if r["id"] == "extremity")
    assert extremity["supported"]
    assert all(v["supported"] for v in extremity["views"])
    assert "Fracture detector (YOLOv7, GRAZPEDWRI-DX)" in extremity["views"][0]["analyzers"]


def test_fracture_is_detected_with_boxes(client: TestClient, sample: Callable[[str], Path]) -> None:
    body = upload(client, sample("wrist_buckle_fracture.jpg"), region="extremity").json()
    assert body["status"] == "ai_ready" and body["priority"] == "urgent"
    fracture = body["findings"][0]
    assert fracture["name"] == "Fracture" and fracture["level"] == "high"
    assert fracture["boxes"] and fracture["heatmap"] is None
    for box in fracture["boxes"]:
        assert 0 <= box["x"] <= 1 and 0 <= box["y"] <= 1
        assert 0 < box["width"] <= 1 and 0 < box["height"] <= 1
        assert box["score"] >= 0.40
    assert "Text" not in {s["name"] for s in body["other_scores"]}  # burned-in labels are ignored


def test_detections_follow_the_reference_preprocessing(client: TestClient, sample: Callable[[str], Path]) -> None:
    image = decode_upload(sample("wrist_salter_harris_fracture.jpg").read_bytes())
    detections = detector(client).detect(image)
    fractures = [score for name, score, _ in detections if name == "Fracture"]
    assert fractures and max(fractures) > 0.6


def test_chest_radiograph_is_refused_as_extremity(client: TestClient, sample: Callable[[str], Path]) -> None:
    body = upload(client, sample("chest_pa_normal.jpg"), region="extremity").json()
    assert body["status"] == "image_rejected"
    assert [c["code"] for c in body["checks"] if c["status"] == "fail"] == ["not_chest_fail"]


def test_knee_is_refused_as_chest_by_the_anatomy_gate(client: TestClient, sample: Callable[[str], Path]) -> None:
    body = upload(client, sample("knee_xray.jpg")).json()
    assert body["status"] == "image_rejected"
    failed = {c["id"] for c in body["checks"] if c["status"] == "fail"}
    assert failed & {"reconstruction", "anatomy"}


def test_single_model_scores_are_labeled_per_model(client: TestClient, sample: Callable[[str], Path]) -> None:
    result = detector(client).analyze(
        decode_upload(sample("wrist_greenstick_fracture.jpg").read_bytes()),
        AnalysisContext("xray", "extremity", "AP", lambda stage: None),
    )
    assert result.raw_scores and all(len(f.model_scores) == 1 for f in result.findings)
