"""Chest X-ray pathology classification: a two-model ensemble with Grad-CAM explanations."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import torch
import torch.nn.functional as F
import torchxrayvision as xrv
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
from torch import nn

from app.analyzers.base import (
    AnalysisContext,
    Analyzer,
    AnalyzerResult,
    CheckCategory,
    CheckStatus,
    Finding,
    Heatmap,
    Level,
    SafetyCheck,
    Scope,
    Stage,
)
from app.analyzers.chest_xray.common import to_batch
from app.analyzers.weights import ensure_weights, fingerprint
from app.imaging import StudyImage

HEATMAP_SIZE = 512
MODEL_LABELS = {"densenet121-res224-all": "DenseNet-121", "resnet50-res512-all": "ResNet-50"}


class _DenseNetHead(nn.Module):
    """DenseNet classifier head, fed with the final (norm5) feature maps."""

    def __init__(self, model: xrv.models.DenseNet) -> None:
        super().__init__()
        self.activations = nn.Identity()  # Grad-CAM target layer
        self.classifier = model.classifier

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        pooled = F.adaptive_avg_pool2d(F.relu(self.activations(features)), 1).flatten(1)
        return self.classifier(pooled)


class _ResNetHead(nn.Module):
    """ResNet classifier head, fed with the layer4 feature maps."""

    def __init__(self, model: xrv.models.ResNet) -> None:
        super().__init__()
        self.activations = nn.Identity()  # Grad-CAM target layer
        self.fc = model.model.fc

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        return self.fc(F.adaptive_avg_pool2d(self.activations(features), 1).flatten(1))


@dataclass(frozen=True)
class _Member:
    """One ensemble model, split into a convolutional backbone and a classifier head.

    The split lets one backbone pass serve both the scores and Grad-CAM: gradients of a class
    logit with respect to the last feature maps depend only on the head, so Grad-CAM on the
    head is exactly Grad-CAM at the network's last convolutional layer, at almost no cost.
    """

    weights: str
    resolution: int
    backbone: nn.Module
    head: nn.Module
    op_threshs: torch.Tensor
    labels: tuple[str, ...]  # display names, in output order
    valid: frozenset[str]  # outputs with an operating point; the others were never trained
    fingerprint: str


def _load_member(weights: str, device: torch.device) -> _Member:
    path = ensure_weights(xrv.models.model_urls[weights]["weights_url"])
    model = xrv.models.get_model(weights).to(device).eval()
    if isinstance(model, xrv.models.DenseNet):
        backbone: nn.Module = model.features
        head: nn.Module = _DenseNetHead(model)
    elif isinstance(model, xrv.models.ResNet):
        net = model.model
        backbone = nn.Sequential(
            net.conv1, net.bn1, net.relu, net.maxpool, net.layer1, net.layer2, net.layer3, net.layer4
        )
        head = _ResNetHead(model)
    else:
        raise ValueError(f"Unsupported torchxrayvision model: {weights}")

    labels = tuple(display_name(label) for label in model.pathologies)
    valid = frozenset(
        label
        for label, threshold in zip(labels, model.op_threshs.tolist())
        if label and not np.isnan(threshold)
    )
    return _Member(
        weights, model.input_resolution, backbone, head, model.op_threshs, labels, valid,
        fingerprint(path),
    )


def display_name(label: str) -> str:
    """'Pleural_Thickening' -> 'Pleural thickening'."""
    return label.replace("_", " ").capitalize()


class PathologyEnsemble(Analyzer):
    """Averages torchxrayvision classifiers over the pathologies they all cover.

    Scores are torchxrayvision's operating-point-normalized outputs: 0.5 is each model's
    calibrated decision threshold. They are model scores, not probabilities.
    """

    label = "Pathology ensemble (DenseNet-121 + ResNet-50)"
    provides_findings = True

    def __init__(
        self,
        analyzer_id: str,
        scopes: Sequence[Scope],
        *,
        models: list[str],
        thresholds: dict[str, float],
        explain_top_k: int = 3,
    ) -> None:
        super().__init__(analyzer_id, scopes)
        if not (thresholds["report"] <= thresholds["moderate"] <= thresholds["high"]):
            raise ValueError("thresholds must satisfy report <= moderate <= high")
        self.model_names = models
        self.report_threshold = thresholds["report"]
        self.moderate_threshold = thresholds["moderate"]
        self.high_threshold = thresholds["high"]
        self.explain_top_k = explain_top_k
        self._members: list[_Member] = []

    def load(self, device: torch.device) -> None:
        self.device = device
        self._members = [_load_member(name, device) for name in self.model_names]
        first = self._members[0]
        self.shared = [
            label for label in first.labels if all(label in m.valid for m in self._members)
        ]
        self.not_assessed = [label for label in first.labels if label and label not in self.shared]

    @property
    def versions(self) -> dict[str, str]:
        return {m.weights: m.fingerprint for m in self._members}

    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        features: dict[str, torch.Tensor] = {}
        raw: dict[str, dict[str, float]] = {}
        for member in self._members:
            x = to_batch(image.square(member.resolution), self.device)
            with torch.no_grad():  # not inference_mode: the features feed Grad-CAM below
                features[member.weights] = member.backbone(x)
                logits = member.head(features[member.weights])
                scores = xrv.models.op_norm(torch.sigmoid(logits), member.op_threshs)[0]
            raw[member.weights] = {
                label: float(score)
                for label, score in zip(member.labels, scores.tolist())
                if label in member.valid
            }

        ensemble = {
            label: float(np.mean([raw[m.weights][label] for m in self._members]))
            for label in self.shared
        }
        findings = [
            self._finding(label, ensemble[label], raw, self._agree(raw, label))
            for label in sorted(self.shared, key=ensemble.__getitem__, reverse=True)
            if ensemble[label] >= self.report_threshold
        ]

        context.progress(Stage.EXPLAINABILITY)
        explained = [f.name for f in findings[: self.explain_top_k]]
        heatmaps = [
            Heatmap(name, values, image.square_box)
            for name, values in zip(explained, self._grad_cam(features, explained))
        ]
        return AnalyzerResult(
            self.id,
            checks=[self._agreement_check(raw, ensemble)],
            findings=findings,
            scores=ensemble,
            raw_scores=raw,
            heatmaps=heatmaps,
            metadata={
                "not_assessed": self.not_assessed,
                "thresholds": {
                    "report": self.report_threshold,
                    "moderate": self.moderate_threshold,
                    "high": self.high_threshold,
                },
            },
        )

    def _agree(self, raw: dict[str, dict[str, float]], label: str) -> bool:
        votes = {raw[m.weights][label] >= self.report_threshold for m in self._members}
        return len(votes) == 1

    def _finding(
        self, label: str, score: float, raw: dict[str, dict[str, float]], agree: bool
    ) -> Finding:
        if not agree or score < self.moderate_threshold:
            level = Level.UNCERTAIN
        elif score < self.high_threshold:
            level = Level.MODERATE
        else:
            level = Level.HIGH
        return Finding(
            name=label,
            score=score,
            level=level,
            model_scores={m.weights: raw[m.weights][label] for m in self._members},
            models_agree=agree,
        )

    def _agreement_check(self, raw: dict[str, dict[str, float]], ensemble: dict[str, float]) -> SafetyCheck:
        """Warns when one model is confident (>= moderate) while another is negative (< report)."""
        conflicts = []
        for label in self.shared:
            scores = {m.weights: raw[m.weights][label] for m in self._members}
            if max(scores.values()) >= self.moderate_threshold and min(scores.values()) < self.report_threshold:
                versus = " vs ".join(f"{MODEL_LABELS.get(w, w)} {s:.2f}" for w, s in scores.items())
                status = "reported as uncertain" if ensemble[label] >= self.report_threshold else "not reported"
                conflicts.append(f"{label} ({versus}; {status})")
        if not conflicts:
            return SafetyCheck(
                "model_agreement", CheckCategory.AGREEMENT, "Model agreement", CheckStatus.PASS,
                "No confident disagreement between the models.", code="agreement_ok",
            )
        return SafetyCheck(
            "model_agreement", CheckCategory.AGREEMENT, "Model agreement", CheckStatus.WARN,
            "The models clearly disagree on " + "; ".join(conflicts) + ". Review these areas.",
            code="agreement_warn", params={"items": "; ".join(conflicts)},
        )

    def _grad_cam(self, features: dict[str, torch.Tensor], labels: list[str]) -> list[np.ndarray]:
        """Grad-CAM maps for ``labels``, averaged over the ensemble members."""
        if not labels:
            return []
        total = torch.zeros(len(labels), HEATMAP_SIZE, HEATMAP_SIZE)
        for member in self._members:
            batch = features[member.weights].expand(len(labels), -1, -1, -1).clone()
            targets = [ClassifierOutputTarget(member.labels.index(label)) for label in labels]
            with GradCAM(model=member.head, target_layers=[member.head.activations]) as cam:
                maps = cam(input_tensor=batch.requires_grad_(True), targets=targets)
            upsampled = F.interpolate(
                torch.from_numpy(maps).unsqueeze(1), size=(HEATMAP_SIZE, HEATMAP_SIZE),
                mode="bicubic", align_corners=False,
            )
            total += upsampled[:, 0].clamp(0, 1)
        return [_rescale(values) for values in total.numpy()]


def _rescale(values: np.ndarray) -> np.ndarray:
    low, high = float(values.min()), float(values.max())
    return ((values - low) / (high - low + 1e-7)).astype(np.float32)
