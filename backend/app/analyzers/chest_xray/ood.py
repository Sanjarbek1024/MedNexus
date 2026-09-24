"""Out-of-distribution gate based on a chest X-ray autoencoder."""

from collections.abc import Sequence

import torch
import torchxrayvision as xrv

from app.analyzers.base import (
    AnalysisContext,
    Analyzer,
    AnalyzerResult,
    CheckCategory,
    CheckStatus,
    SafetyCheck,
    Scope,
    Stage,
)
from app.analyzers.chest_xray.common import ensure_weights, fingerprint, to_batch
from app.imaging import XRV_RANGE, StudyImage


class AutoencoderOODGate(Analyzer):
    """Rejects images the chest X-ray autoencoder cannot reconstruct.

    The autoencoder was trained only on chest radiographs, so a high reconstruction error
    means the image is unlike its training data (another body part, a photo, heavy artefacts).
    The error is the mean absolute pixel difference on a [-1, 1] intensity scale.
    """

    label = "Out-of-distribution gate (autoencoder)"
    stage = Stage.QUALITY

    def __init__(
        self,
        analyzer_id: str,
        scopes: Sequence[Scope],
        *,
        weights: str,
        max_error: float,
        warn_error: float,
    ) -> None:
        super().__init__(analyzer_id, scopes)
        self.weights = weights
        self.max_error = max_error
        self.warn_error = warn_error
        self._versions: dict[str, str] = {}

    def load(self, device: torch.device) -> None:
        path = ensure_weights(xrv.autoencoders.model_urls[self.weights]["weights_url"])
        self.device = device
        self.model = xrv.autoencoders.ResNetAE(weights=self.weights).to(device).eval()
        self._versions = {f"autoencoder-{self.weights}": fingerprint(path)}

    @property
    def versions(self) -> dict[str, str]:
        return self._versions

    def reconstruction_error(self, image: StudyImage) -> float:
        x = to_batch(image.square(224), self.device)
        with torch.inference_mode():
            reconstruction = self.model(x)["out"]
        return float((reconstruction - x).abs().mean() / XRV_RANGE)

    def analyze(self, image: StudyImage, context: AnalysisContext) -> AnalyzerResult:
        error = self.reconstruction_error(image)
        measured = f"Reconstruction error {error:.3f} (rejection limit {self.max_error:.3f})."
        if error > self.max_error:
            status = CheckStatus.FAIL
            detail = f"The image does not resemble a chest radiograph. {measured}"
        elif error > self.warn_error:
            status = CheckStatus.WARN
            detail = f"Atypical for a chest radiograph; interpret with extra care. {measured}"
        else:
            status = CheckStatus.PASS
            detail = f"Consistent with the chest X-rays the models were trained on. {measured}"
        check = SafetyCheck(
            "reconstruction", CheckCategory.DISTRIBUTION, "In-distribution", status, detail,
            blocking=True,
        )
        return AnalyzerResult(self.id, checks=[check], metadata={"reconstruction_error": error})
