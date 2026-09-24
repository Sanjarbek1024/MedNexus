"""Fracture detection on extremity radiographs (YOLOv7-p6, trained on GRAZPEDWRI-DX).

Runs the published ONNX export with ONNX Runtime, using the reference preprocessing of the
model's repository: RGB, plain resize to 640 × 640, pixels scaled to [0, 1]. Non-maximum
suppression is part of the exported graph; each output row is (x1, y1, x2, y2, score, class).
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import onnxruntime as ort
import torch
from PIL import Image

from app.analyzers.base import (
    AnalysisContext,
    Analyzer,
    AnalyzerResult,
    Detection,
    Finding,
    Level,
    Scope,
    Stage,
)
from app.analyzers.weights import ensure_weights, fingerprint
from app.imaging import Box, StudyImage

INPUT_SIZE = 640
# Model classes in output order. None = not reported ("text" marks burned-in annotations).
CLASSES: list[str | None] = [
    "Bone anomaly", "Bone lesion", "Foreign body", "Fracture", "Metal", "Periosteal reaction",
    "Pronator sign", "Soft tissue finding", None,
]


class FractureDetector(Analyzer):
    """Scores are detection confidences, not probabilities; each box localizes one detection."""

    label = "Fracture detector (YOLOv7, GRAZPEDWRI-DX)"
    provides_findings = True

    def __init__(
        self,
        analyzer_id: str,
        scopes: Sequence[Scope],
        *,
        weights_url: str,
        thresholds: dict[str, float],
        min_box_score: float = 0.25,
    ) -> None:
        super().__init__(analyzer_id, scopes)
        if not (thresholds["report"] <= thresholds["moderate"] <= thresholds["high"]):
            raise ValueError("thresholds must satisfy report <= moderate <= high")
        self.weights_url = weights_url
        self.thresholds = thresholds
        self.min_box_score = min_box_score
        self._versions: dict[str, str] = {}

    def load(self, device: torch.device) -> None:
        path = ensure_weights(self.weights_url)
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if device.type == "cuda" else ["CPUExecutionProvider"]
        self.session = ort.InferenceSession(str(path), providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self._versions = {path.stem: fingerprint(path)}

    @property
    def versions(self) -> dict[str, str]:
        return self._versions

    def detect(self, image: StudyImage) -> list[tuple[str, float, Box]]:
        gray = Image.fromarray(np.clip(image.unit() * 255, 0, 255).astype(np.uint8))
        rgb = np.asarray(gray.convert("RGB").resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.BILINEAR))
        batch = (rgb.astype(np.float32) / 255).transpose(2, 0, 1)[None]
        rows = self.session.run(None, {self.input_name: batch})[0]
        detections = []
        for x1, y1, x2, y2, score, label in rows[:, :6]:
            name = CLASSES[int(label)] if 0 <= int(label) < len(CLASSES) else None
            if name is None or score < self.min_box_score:
                continue
            x1, x2 = sorted(np.clip([x1, x2], 0, INPUT_SIZE) / INPUT_SIZE)
            y1, y2 = sorted(np.clip([y1, y2], 0, INPUT_SIZE) / INPUT_SIZE)
            detections.append((name, float(score), Box(float(x1), float(y1), float(x2 - x1), float(y2 - y1))))
        return detections

    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        detections = self.detect(image)
        context.progress(Stage.EXPLAINABILITY)  # the boxes are this model's explanation

        best = {name: 0.0 for name in CLASSES if name}
        boxes: dict[str, list[Detection]] = {name: [] for name in best}
        for name, score, box in detections:
            best[name] = max(best[name], score)
            if score >= self.thresholds["report"]:
                boxes[name].append(Detection(box, score))

        model = next(iter(self._versions), "fracture-detector")
        findings = [
            Finding(
                name=name, score=score, level=self._level(score), model_scores={model: score},
                models_agree=True, boxes=tuple(sorted(boxes[name], key=lambda d: -d.score)),
            )
            for name, score in sorted(best.items(), key=lambda item: -item[1])
            if score >= self.thresholds["report"]
        ]
        return AnalyzerResult(
            self.id,
            findings=findings,
            scores=best,
            raw_scores={model: best},
            metadata={"thresholds": self.thresholds},
        )

    def _level(self, score: float) -> Level:
        if score >= self.thresholds["high"]:
            return Level.HIGH
        if score >= self.thresholds["moderate"]:
            return Level.MODERATE
        return Level.UNCERTAIN
