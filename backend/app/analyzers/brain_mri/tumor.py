"""Brain tumor classification on MRI slices (ViT-B/16, four classes).

The published checkpoint is a Hugging Face ``ViTForImageClassification`` (ViT-B/16 at 224 px)
fine-tuned to classify a brain MRI slice as glioma, meningioma, pituitary tumor or no tumor.
It is loaded into torchvision's ViT-B/16, the same architecture, straight from its safetensors
file. Preprocessing follows the model's image processor: RGB, plain bilinear resize to
224 × 224, pixels scaled to [-1, 1].
"""

from __future__ import annotations

import json
import struct
from collections.abc import Mapping, Sequence
from functools import partial
from pathlib import Path

import numpy as np
import torch
import torchvision
from PIL import Image
from torch import nn

from app.analyzers.base import (
    AnalysisContext,
    Analyzer,
    AnalyzerResult,
    Finding,
    Level,
    Scope,
)
from app.analyzers.weights import ensure_weights, fingerprint
from app.imaging import StudyImage

INPUT_SIZE = 224
NO_TUMOR = "No tumor"
# Model classes in output order; ``NO_TUMOR`` is scored but never reported as a finding.
CLASSES = ["Glioma", "Meningioma", NO_TUMOR, "Pituitary tumor"]
MODEL_NAME = "vit-b16-brain-tumor"
_DTYPES = {"F32": np.float32, "F16": np.float16, "BF16": None, "I64": np.int64}


def read_safetensors(path: Path) -> dict[str, torch.Tensor]:
    """Tensors of a ``.safetensors`` file: an 8-byte header size, a JSON header, raw data."""
    with path.open("rb") as handle:
        (header_size,) = struct.unpack("<Q", handle.read(8))
        header = json.loads(handle.read(header_size))
    data = np.memmap(path, dtype=np.uint8, mode="r", offset=8 + header_size)
    tensors = {}
    for name, entry in header.items():
        if name == "__metadata__":
            continue
        dtype = _DTYPES.get(entry["dtype"])
        if dtype is None:
            raise ValueError(f"{path.name}: unsupported tensor type {entry['dtype']}")
        start, end = entry["data_offsets"]
        tensors[name] = torch.from_numpy(data[start:end].view(dtype).reshape(entry["shape"]).copy())
    del data  # release the file mapping
    return tensors


def to_torchvision(state: Mapping[str, torch.Tensor]) -> dict[str, torch.Tensor]:
    """Rename a Hugging Face ViT state dict to torchvision's ``VisionTransformer`` keys."""
    mapped = {
        "class_token": state["vit.embeddings.cls_token"],
        "encoder.pos_embedding": state["vit.embeddings.position_embeddings"],
        "conv_proj.weight": state["vit.embeddings.patch_embeddings.projection.weight"],
        "conv_proj.bias": state["vit.embeddings.patch_embeddings.projection.bias"],
        "encoder.ln.weight": state["vit.layernorm.weight"],
        "encoder.ln.bias": state["vit.layernorm.bias"],
        "heads.head.weight": state["classifier.weight"],
        "heads.head.bias": state["classifier.bias"],
    }
    layers = {int(key.split(".")[3]) for key in state if key.startswith("vit.encoder.layer.")}
    for index in sorted(layers):
        source, target = f"vit.encoder.layer.{index}.", f"encoder.layers.encoder_layer_{index}."
        for kind in ("weight", "bias"):
            # torchvision packs the query, key and value projections into one matrix.
            mapped[f"{target}self_attention.in_proj_{kind}"] = torch.cat(
                [state[f"{source}attention.attention.{part}.{kind}"] for part in ("query", "key", "value")]
            )
            mapped[f"{target}self_attention.out_proj.{kind}"] = state[f"{source}attention.output.dense.{kind}"]
            mapped[f"{target}ln_1.{kind}"] = state[f"{source}layernorm_before.{kind}"]
            mapped[f"{target}ln_2.{kind}"] = state[f"{source}layernorm_after.{kind}"]
            mapped[f"{target}mlp.0.{kind}"] = state[f"{source}intermediate.dense.{kind}"]
            mapped[f"{target}mlp.3.{kind}"] = state[f"{source}output.dense.{kind}"]
    return mapped


def preprocess(image: StudyImage) -> torch.Tensor:
    """(1, 3, 224, 224) model input in [-1, 1], the grayscale slice repeated as RGB."""
    gray = Image.fromarray(np.clip(image.unit() * 255, 0, 255).astype(np.uint8))
    resized = np.asarray(gray.resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.BILINEAR), dtype=np.float32)
    scaled = resized / 127.5 - 1
    return torch.from_numpy(np.repeat(scaled[None, None], 3, axis=1))


class BrainTumorClassifier(Analyzer):
    """Scores are softmax outputs of one model, not calibrated probabilities."""

    label = "Brain tumor classifier (ViT-B/16, brain MRI)"
    provides_findings = True

    def __init__(
        self,
        analyzer_id: str,
        scopes: Sequence[Scope],
        *,
        weights_url: str,
        thresholds: dict[str, float],
        weights_file: str | None = None,
    ) -> None:
        super().__init__(analyzer_id, scopes)
        if not (thresholds["report"] <= thresholds["moderate"] <= thresholds["high"]):
            raise ValueError("thresholds must satisfy report <= moderate <= high")
        self.weights_url = weights_url
        self.weights_file = weights_file
        self.thresholds = thresholds
        self._versions: dict[str, str] = {}

    def load(self, device: torch.device) -> None:
        self.load_file(ensure_weights(self.weights_url, self.weights_file), device)

    def load_file(self, path: Path, device: torch.device) -> None:
        # Hugging Face ViT uses LayerNorm eps 1e-12 (torchvision's default is 1e-6).
        model = torchvision.models.vit_b_16(num_classes=len(CLASSES), norm_layer=partial(nn.LayerNorm, eps=1e-12))
        model.load_state_dict(to_torchvision(read_safetensors(path)))
        self.model = model.eval().to(device)
        self.device = device
        self._versions = {MODEL_NAME: fingerprint(path)}

    @property
    def versions(self) -> dict[str, str]:
        return self._versions

    @torch.inference_mode()
    def predict(self, image: StudyImage) -> dict[str, float]:
        """Softmax score of every class, including "No tumor"."""
        logits = self.model(preprocess(image).to(self.device))[0]
        return dict(zip(CLASSES, torch.softmax(logits, dim=0).tolist(), strict=True))

    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        return self.result(self.predict(image))

    def result(self, probabilities: Mapping[str, float]) -> AnalyzerResult:
        """Report tumor classes above the threshold, unless "No tumor" is the top class."""
        tumors = {name: float(score) for name, score in probabilities.items() if name != NO_TUMOR}
        top = max(probabilities, key=probabilities.__getitem__)
        findings = [
            Finding(name=name, score=score, level=self._level(score), model_scores={MODEL_NAME: score}, models_agree=True)
            for name, score in sorted(tumors.items(), key=lambda item: -item[1])
            if top != NO_TUMOR and score >= self.thresholds["report"]
        ]
        return AnalyzerResult(
            self.id,
            findings=findings,
            scores=tumors,
            raw_scores={MODEL_NAME: {name: float(score) for name, score in probabilities.items()}},
            metadata={"thresholds": self.thresholds},
        )

    def _level(self, score: float) -> Level:
        if score >= self.thresholds["high"]:
            return Level.HIGH
        if score >= self.thresholds["moderate"]:
            return Level.MODERATE
        return Level.UNCERTAIN
