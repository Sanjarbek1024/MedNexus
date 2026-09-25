"""The brain MRI tumor classifier: key mapping, preprocessing, reporting rules and real weights."""

import json
import struct
from collections.abc import Callable
from functools import partial
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
import pytest
import torch
import torchxrayvision as xrv
from torchvision.models.vision_transformer import VisionTransformer

from app.analyzers.base import AnalysisContext, Level, Scope
from app.analyzers.brain_mri.tumor import (
    CLASSES,
    NO_TUMOR,
    BrainTumorClassifier,
    preprocess,
    read_safetensors,
    to_torchvision,
)
from app.analyzers.registry import AnalyzerRegistry
from app.config import get_settings
from app.imaging import StudyImage, decode_upload

THRESHOLDS = {"report": 0.50, "moderate": 0.70, "high": 0.90}


def classifier(thresholds: dict[str, float] = THRESHOLDS) -> BrainTumorClassifier:
    return BrainTumorClassifier(
        "brain_mri_tumor", [Scope("mri", "head")], weights_url="https://example.org/model.safetensors", thresholds=thresholds
    )


def scores(glioma: float, meningioma: float, no_tumor: float, pituitary: float) -> dict[str, float]:
    return dict(zip(CLASSES, [glioma, meningioma, no_tumor, pituitary], strict=True))


def hf_vit_state(hidden: int, layers: int, mlp: int, patch: int, tokens: int, classes: int) -> dict[str, torch.Tensor]:
    """Random tensors named and shaped like a Hugging Face ``ViTForImageClassification``."""
    shapes = {
        "vit.embeddings.cls_token": (1, 1, hidden),
        "vit.embeddings.position_embeddings": (1, tokens, hidden),
        "vit.embeddings.patch_embeddings.projection.weight": (hidden, 3, patch, patch),
        "vit.embeddings.patch_embeddings.projection.bias": (hidden,),
        "vit.layernorm.weight": (hidden,),
        "vit.layernorm.bias": (hidden,),
        "classifier.weight": (classes, hidden),
        "classifier.bias": (classes,),
    }
    for i in range(layers):
        p = f"vit.encoder.layer.{i}."
        for name, out, inp in [
            ("attention.attention.query", hidden, hidden), ("attention.attention.key", hidden, hidden),
            ("attention.attention.value", hidden, hidden), ("attention.output.dense", hidden, hidden),
            ("intermediate.dense", mlp, hidden), ("output.dense", hidden, mlp),
        ]:
            shapes[f"{p}{name}.weight"], shapes[f"{p}{name}.bias"] = (out, inp), (out,)
        for norm in ("layernorm_before", "layernorm_after"):
            shapes[f"{p}{norm}.weight"], shapes[f"{p}{norm}.bias"] = (hidden,), (hidden,)
    return {name: torch.randn(shape) for name, shape in shapes.items()}


def test_hugging_face_keys_map_onto_torchvision_vit() -> None:
    state = hf_vit_state(hidden=8, layers=2, mlp=16, patch=16, tokens=5, classes=4)
    model = VisionTransformer(
        image_size=32, patch_size=16, num_layers=2, num_heads=2, hidden_dim=8, mlp_dim=16, num_classes=4,
        norm_layer=partial(torch.nn.LayerNorm, eps=1e-12),
    )
    model.load_state_dict(to_torchvision(state), strict=True)
    in_proj = model.state_dict()["encoder.layers.encoder_layer_1.self_attention.in_proj_weight"]
    assert torch.equal(in_proj[8:16], state["vit.encoder.layer.1.attention.attention.key.weight"])


def test_safetensors_are_read_without_the_safetensors_package(tmp_path: Path) -> None:
    tensors = {"a": np.arange(6, dtype=np.float32).reshape(2, 3), "b": np.array([7], dtype=np.int64)}
    header, blobs, offset = {"__metadata__": {"format": "pt"}}, [], 0
    for name, array in tensors.items():
        data = array.tobytes()
        header[name] = {"dtype": {"float32": "F32", "int64": "I64"}[str(array.dtype)], "shape": list(array.shape),
                        "data_offsets": [offset, offset + len(data)]}
        blobs.append(data)
        offset += len(data)
    encoded = json.dumps(header).encode()
    path = tmp_path / "tiny.safetensors"
    path.write_bytes(struct.pack("<Q", len(encoded)) + encoded + b"".join(blobs))

    loaded = read_safetensors(path)
    assert set(loaded) == {"a", "b"}
    assert torch.equal(loaded["a"], torch.arange(6, dtype=torch.float32).reshape(2, 3))
    assert loaded["b"].tolist() == [7]


def test_preprocessing_matches_the_model_image_processor() -> None:
    gradient = np.tile(np.linspace(-1024, 1024, 300, dtype=np.float32), (200, 1))
    batch = preprocess(StudyImage(gradient, 0.0, "png", "0" * 64))
    assert batch.shape == (1, 3, 224, 224) and batch.dtype == torch.float32
    assert torch.equal(batch[:, 0], batch[:, 1]) and torch.equal(batch[:, 1], batch[:, 2])
    assert batch.min() >= -1 and batch.max() <= 1
    assert batch[0, 0, :, 0].mean() < -0.95 and batch[0, 0, :, -1].mean() > 0.95


def test_top_tumor_class_is_reported_with_its_level() -> None:
    result = classifier().result(scores(0.93, 0.04, 0.02, 0.01))
    assert [(f.name, f.level) for f in result.findings] == [("Glioma", Level.HIGH)]
    assert result.findings[0].model_scores == {"vit-b16-brain-tumor": pytest.approx(0.93)}
    assert NO_TUMOR not in result.scores and set(result.scores) == {"Glioma", "Meningioma", "Pituitary tumor"}
    assert result.raw_scores["vit-b16-brain-tumor"][NO_TUMOR] == pytest.approx(0.02)

    assert classifier().result(scores(0.05, 0.75, 0.10, 0.10)).findings[0].level is Level.MODERATE
    assert classifier().result(scores(0.05, 0.10, 0.30, 0.55)).findings[0].level is Level.UNCERTAIN


def test_no_tumor_and_low_scores_produce_no_findings() -> None:
    assert classifier().result(scores(0.01, 0.01, 0.97, 0.01)).findings == []
    assert classifier().result(scores(0.40, 0.35, 0.15, 0.10)).findings == []  # below `report`
    # A tumor class above a low `report` threshold is still not shown when "No tumor" wins.
    low = classifier({"report": 0.30, "moderate": 0.60, "high": 0.90})
    assert low.result(scores(0.35, 0.05, 0.55, 0.05)).findings == []


def test_thresholds_must_be_ordered() -> None:
    with pytest.raises(ValueError):
        classifier({"report": 0.8, "moderate": 0.6, "high": 0.9})


def test_brain_mri_is_a_supported_combination() -> None:
    registry = AnalyzerRegistry.from_yaml(get_settings().registry_path)
    ids = [a.id for a in registry.pipeline("mri", "head", "Axial")]
    assert "brain_mri_quality" in ids and ids[-1] == "brain_mri_tumor"
    assert registry.is_supported("mri", "head", "Coronal")
    assert not any(a.id == "brain_mri_tumor" for a in registry.pipeline("ct", "head", "Axial"))


@pytest.fixture(scope="module")
def trained() -> BrainTumorClassifier:
    """The real model, when its weights are already in the model cache (no download here)."""
    registry = AnalyzerRegistry.from_yaml(get_settings().registry_path)
    analyzer = next(a for a in registry.analyzers if a.id == "brain_mri_tumor")
    path = Path(xrv.utils.get_cache_dir()) / (analyzer.weights_file or Path(urlparse(analyzer.weights_url).path).name)
    if not path.is_file():
        pytest.skip("brain tumor weights not downloaded yet (start the app once)")
    analyzer.load_file(path, torch.device("cpu"))
    return analyzer


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("brain_mri_glioma.jpg", "Glioma"),
        ("brain_mri_meningioma.jpg", "Meningioma"),
        ("brain_mri_pituitary.jpg", "Pituitary tumor"),
        ("brain_mri_normal.jpg", None),
    ],
)
def test_samples_are_classified(
    trained: BrainTumorClassifier, sample: Callable[[str], Path], filename: str, expected: str | None
) -> None:
    image = decode_upload(sample(filename).read_bytes())
    result = trained.analyze(image, AnalysisContext("mri", "head", "Axial", lambda stage: None))
    assert [f.name for f in result.findings] == ([expected] if expected else [])
    if expected:
        assert result.findings[0].score > 0.7
    assert sum(result.raw_scores["vit-b16-brain-tumor"].values()) == pytest.approx(1, abs=1e-4)
