from pathlib import Path

import pytest

from app.analyzers.registry import AnalyzerRegistry, RegistryError

TAXONOMY = """
taxonomy:
  modalities:
    - {id: xray, label: X-ray, views: [PA, AP, Lateral]}
    - {id: ct, label: CT, views: [Axial]}
  regions:
    - {id: chest, label: Chest}
    - {id: head, label: Head}
"""

ANALYZERS = """
analyzers:
  - id: classifier
    class: tests.fakes:FakeClassifier
    applies_to: [{modality: xray, region: chest, views: [PA, AP]}]
    params: {threshold: 0.6}
  - id: gate
    class: tests.fakes:FakeGate
    applies_to: [{modality: xray}]
"""


def load(tmp_path: Path, text: str) -> AnalyzerRegistry:
    path = tmp_path / "analyzers.yaml"
    path.write_text(text, encoding="utf-8")
    return AnalyzerRegistry.from_yaml(path)


def test_pipeline_runs_gates_first(tmp_path: Path) -> None:
    registry = load(tmp_path, TAXONOMY + ANALYZERS)
    assert [a.id for a in registry.pipeline("xray", "chest", "PA")] == ["gate", "classifier"]
    assert [a.id for a in registry.pipeline("xray", "head", "PA")] == ["gate"]
    assert registry.pipeline("ct", "chest", "Axial") == []


def test_params_reach_the_analyzer(tmp_path: Path) -> None:
    registry = load(tmp_path, TAXONOMY + ANALYZERS)
    classifier = next(a for a in registry.analyzers if a.id == "classifier")
    assert classifier.threshold == 0.6


def test_capabilities_mark_unsupported_combinations(tmp_path: Path) -> None:
    capabilities = load(tmp_path, TAXONOMY + ANALYZERS).capabilities()
    xray, ct = capabilities.modalities
    chest, head = xray.regions

    assert xray.supported and chest.supported
    assert {v.id: v.supported for v in chest.views} == {"PA": True, "AP": True, "Lateral": False}
    assert chest.views[0].analyzers == ["Fake gate", "Fake classifier"]
    # A gate alone produces no findings, so the combination stays "coming soon".
    assert not head.supported
    assert not ct.supported
    assert capabilities.default_language == "uz"
    assert [lang.id for lang in capabilities.languages] == ["uz", "en", "ru"]


@pytest.mark.parametrize(
    "analyzers",
    [
        "analyzers: [{id: a, class: 'tests.fakes:FakeGate', applies_to: [{modality: pet}]}]",
        "analyzers: [{id: a, class: 'tests.fakes:FakeGate', applies_to: [{region: knee}]}]",
        "analyzers: [{id: a, class: 'tests.fakes:FakeGate', applies_to: [{modality: ct, views: [PA]}]}]",
        "analyzers: [{id: a, class: 'tests.fakes:Missing', applies_to: [{}]}]",
        "analyzers: [{id: a, class: 'app.config:Settings', applies_to: [{}]}]",
        "analyzers: [{id: a, class: 'tests.fakes:FakeClassifier', applies_to: [{}], params: {bad: 1}}]",
        "analyzers: [{id: a, class: 'tests.fakes:FakeGate', applies_to: [{}]}, "
        "{id: a, class: 'tests.fakes:FakeGate', applies_to: [{}]}]",
    ],
)
def test_invalid_registry_is_rejected(tmp_path: Path, analyzers: str) -> None:
    with pytest.raises(RegistryError):
        load(tmp_path, TAXONOMY + analyzers)
