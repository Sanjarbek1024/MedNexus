# MedNexus

AI decision support for medical image review: open-source models flag findings, explain where they looked and check their own limits, and the physician makes the final call.

> **Screenshot:** add `docs/screenshot.png` here.

## Features

- **Upload & select**: DICOM, PNG or JPEG, plus modality, body region and view. Every option comes from the analyzer registry; unsupported combinations show as *Coming soon*.
- **Chest X-ray pipeline**: an ensemble of DenseNet-121 and ResNet-50 (torchxrayvision), scores averaged over the pathologies both models cover, with the agreement between models shown for each finding.
- **Explainability**: Grad-CAM heatmaps for the top findings, plus PSPNet lung and heart contours and an estimated cardiothoracic ratio.
- **Safety layer**
  - Quality, out-of-distribution (autoencoder), anatomy and DICOM-header gates. A failed gate returns *Image rejected* with the reason and no findings.
  - Configurable confidence thresholds. Low-confidence findings, or findings the models disagree on, are marked *Uncertain – physician review required*.
  - Human in the loop: results stay *Draft (AI)* until a physician confirms, edits or rejects them.
  - Append-only audit log in SQLite, hash-chained with SHA-256 so edits or deletions are detectable. It records the image hash, study type, model versions, raw scores, AI report and physician decision. No patient identifiers are stored.
- **Grounded report**: an LLM (Groq) writes the summary, next steps and limitations in Uzbek, English or Russian from the model outputs only; it never sees the image. Findings the models did not produce are removed. If the LLM is unavailable, results are shown without the narrative.
- **Live progress** over server-sent events, zoom and pan, side-by-side comparison, history view, and PDF export via the browser's print dialog.

Scores are the models' outputs normalized so that 0.50 is each model's decision threshold. They are not calibrated probabilities.

## Quick start

With Docker:

```bash
cp backend/.env.example backend/.env   # optional: set GROQ_API_KEY
docker compose up --build              # http://localhost:8080
```

Locally (Python 3.11, Node 22+; on Windows use `backend\.venv\Scripts\python`):

```bash
python3.11 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements-dev.txt
(cd frontend && npm ci) && cp backend/.env.example backend/.env
backend/.venv/bin/python scripts/download_samples.py    # demo images, see samples/SOURCES.md
backend/.venv/bin/python scripts/dev.py                 # http://localhost:5173, API docs at :8000/docs
```

On Linux or macOS, `make setup samples dev` does the same. Run the tests with `make test`, or `python -m pytest` from `backend/`. Model weights (~520 MB) are downloaded on first start.

## Architecture

```
frontend/  React + Vite + TypeScript + Tailwind + framer-motion
backend/
  analyzers.yaml        registry: which analyzers run for which modality / region / view
  app/analyzers/        plugins: quality and DICOM gates, chest_xray/ (OOD, anatomy, pathology)
  app/services/         pipeline runner, overlay rendering, LLM report, use cases
  app/db/               SQLite case store and hash-chained audit log
  app/api/              FastAPI routes: /api/health, /capabilities, /analyze, /cases, /audit
```

A study runs every analyzer that `supports()` its modality, region and view: gates first, then models. The pipeline stops at the first blocking safety check. The LLM receives only the structured result.

**Adding a model** takes one class and one registry entry; the frontend needs no changes:

```python
# backend/app/analyzers/ct_head.py
class HemorrhageDetector(Analyzer):
    label = "Intracranial hemorrhage (CNN)"
    provides_findings = True

    def load(self, device): ...                      # load weights once at startup
    def analyze(self, image, context) -> AnalyzerResult:
        return AnalyzerResult(self.id, findings=[...], heatmaps=[...])
```

```yaml
# backend/analyzers.yaml
  - id: ct_head_hemorrhage
    class: app.analyzers.ct_head:HemorrhageDetector
    applies_to: [{modality: ct, region: head, views: [Axial]}]
```

CT · Head · Axial then becomes selectable in the UI. A vision-language model fits the same interface: it returns findings (and optionally heatmaps or masks) from `analyze`.

## Models and credits

| Component | Source | License |
|---|---|---|
| DenseNet-121 `densenet121-res224-all`, ResNet-50 `resnet50-res512-all` | [torchxrayvision](https://github.com/mlmed/torchxrayvision), Cohen et al., *MIDL 2022* | Apache-2.0 |
| ResNet autoencoder `101-elastic` (OOD gate) | torchxrayvision | Apache-2.0 |
| PSPNet anatomy segmentation | torchxrayvision, trained on [ChestX-Det](https://github.com/Deepwise-AILab/ChestX-Det-Dataset) (Lian et al., 2021) | Apache-2.0 |
| Grad-CAM | [pytorch-grad-cam](https://github.com/jacobgil/pytorch-grad-cam) | MIT |
| Report LLM (default `openai/gpt-oss-120b`, set with `GROQ_MODEL`) | [Groq API](https://console.groq.com/docs/models) | Apache-2.0 model weights; Groq terms of service |

Sample images: see [samples/SOURCES.md](samples/SOURCES.md) (CC0, public domain, NIH ChestX-ray14).

## Disclaimer

Research prototype. Not a certified medical device. It does not diagnose. All output is AI decision support that requires confirmation by a qualified physician. No clinical accuracy is claimed.
