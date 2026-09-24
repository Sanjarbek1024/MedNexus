"""End-to-end pipeline tests with the real model weights and the bundled samples."""

from collections.abc import Callable
from pathlib import Path

from fastapi.testclient import TestClient

from app.analyzers.base import CheckStatus, Stage
from app.imaging import decode_upload
from app.services.pipeline import AnalysisPipeline, PipelineOutcome


def run(client: TestClient, path: Path, view: str = "PA") -> tuple[PipelineOutcome, list[Stage]]:
    pipeline = AnalysisPipeline(client.app.state.registry)
    stages: list[Stage] = []
    image = decode_upload(path.read_bytes())
    return pipeline.run(image, "xray", "chest", view, stages.append), stages


def test_chest_xray_produces_findings_heatmaps_and_anatomy(
    client: TestClient, sample: Callable[[str], Path]
) -> None:
    outcome, stages = run(client, sample("chest_pa_pneumonia.jpg"))

    assert not outcome.rejected
    assert stages[0] is Stage.QUALITY and Stage.EXPLAINABILITY in stages
    findings = outcome.collect("findings")
    assert findings[0].name == "Consolidation"
    assert all(0.5 <= f.score <= 1 for f in findings)
    assert [f.score for f in findings] == sorted((f.score for f in findings), reverse=True)

    heatmaps = outcome.collect("heatmaps")
    assert 1 <= len(heatmaps) <= 3
    assert heatmaps[0].values.min() >= 0 and heatmaps[0].values.max() <= 1
    assert {m.label for m in outcome.collect("masks")} == {"Right lung", "Left lung", "Heart"}
    ctr = outcome.collect("measurements")[0]
    assert ctr.id == "ctr" and 0.3 < ctr.value < 0.8


def test_normal_chest_xray_reports_nothing(client: TestClient, sample: Callable[[str], Path]) -> None:
    outcome, _ = run(client, sample("chest_pa_normal.jpg"))
    assert not outcome.rejected
    assert outcome.collect("findings") == []


def test_hand_xray_is_rejected_as_out_of_distribution(
    client: TestClient, sample: Callable[[str], Path]
) -> None:
    outcome, stages = run(client, sample("hand_xray.jpg"))
    assert outcome.rejected
    assert outcome.collect("findings") == []
    assert Stage.MODELS not in stages
    failed = [c.id for c in outcome.collect("checks") if c.status is CheckStatus.FAIL]
    assert failed == ["reconstruction"]


def test_color_photo_is_rejected_by_the_quality_gate(
    client: TestClient, sample: Callable[[str], Path]
) -> None:
    outcome, _ = run(client, sample("photo_kitten.jpg"))
    assert outcome.rejected
    assert [c.id for c in outcome.collect("checks") if c.rejects] == ["grayscale"]


def test_dicom_is_decoded_and_header_checked(client: TestClient, sample: Callable[[str], Path]) -> None:
    outcome, _ = run(client, sample("chest_pa_normal.dcm"), view="AP")
    checks = {c.id: c for c in outcome.collect("checks")}
    assert not outcome.rejected
    assert checks["dicom_view"].status is CheckStatus.WARN  # header says PA, AP selected
    assert "AP projection" in outcome.collect("measurements")[0].detail
