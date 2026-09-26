# MedNexus

AI differential diagnosis for physicians. The doctor enters the complaint, symptoms, vital signs, history, examination and labs; a deterministic clinical rules engine scores the patient, an AI reasoner builds the differential with evidence per source, and a safety critic checks it. An X-ray or MRI is optional: it can be added at intake or later, and the differential is rebuilt with the image. Every answer is an estimate; the doctor makes every decision.

<!-- Screenshots: add images to docs/screenshots/ and reference them here. -->
> **Screenshots:** `docs/screenshots/landing.png` · `worklist.png` · `case.png` · `compare.png` · `training.png`

## Features

MedNexus is a physician tool (role *Doctor*, monthly subscription, free during the pilot).

**Differential diagnosis first**
- **Structured intake.** Chief complaint, onset, duration and severity; a symptom checklist grouped by system (red-flag symptoms are marked); vital signs (temperature, heart rate, respiratory rate, blood pressure, SpO₂, oxygen, ACVPU consciousness); history, medications, allergies and smoking; examination and laboratory results.
- **Live triage.** While the intake is typed, the rules engine recalculates NEWS2, qSOFA, CRB-65 and the shock index and lists red flags. No model is involved.
- **Symptoms-only differential.** Without an image the clinical reasoner (gpt-oss-120b) builds 3-5 diagnoses, each with evidence for and against tagged by source (Symptom, Vitals, Exam, Lab, History), confirmatory tests and a *cannot-miss* flag. A second LLM pass, the safety critic, adds dangerous diagnoses the draft missed and notes ignored red flags.
- **Imaging, optional and later.** Add a chest X-ray, limb X-ray or brain MRI at intake or from the case page; the imaging models run and the differential is rebuilt from the image and the clinical picture together.
- **Transparent AI architecture.** Every case shows the steps that actually ran (rules → imaging → vision reading → reasoner → critic → guardrails) with their models and timings.

**Hybrid AI architecture**

| Layer | What it does |
|---|---|
| Clinical rules engine | NEWS2, qSOFA, CRB-65, shock index and red flags from their published definitions. Drives triage and sets an urgency floor the models cannot lower. |
| Imaging models (optional) | Safety gates, a DenseNet-121 + ResNet-50 chest ensemble, a YOLOv7 fracture detector, a ViT-B/16 brain tumor classifier, Grad-CAM. |
| Vision-language reading | An open-weights VLM describes what is visible on the image (no diagnosis). |
| Clinical reasoner | gpt-oss-120b builds the differential from the intake, the rules output and, when present, the image reading and model outputs. |
| Safety critic | A second gpt-oss-120b pass looks for missed cannot-miss diagnoses and ignored red flags. |
| Guardrails | Estimates capped at 90 % (sum ≤ 100 %), urgency floor, language check, disclaimer written by the app. |

**Workspace**
- **Smart worklist.** Cases are ordered by urgency (rules engine and imaging triage, whichever is higher), with the time in queue always visible. Filters, search and batch image upload run in the background.
- **Explainability.** Grad-CAM heatmaps, lung and heart contours, an estimated cardiothoracic ratio, and detection boxes. The viewer has zoom/pan, side-by-side view and keyboard shortcuts.
- **Prior comparison.** Two imaging studies of one patient in synced viewers, a findings delta (improved / stable / worsened) and an LLM-drafted interval summary.
- **Report editor.** A structured report (Findings / Impression / Recommendations) pre-filled from the AI draft. The physician agrees or disagrees with each finding, then signs and finalizes, and can export to PDF.
- **Continue in chat.** Streaming Q&A about the case, grounded in the intake, the rules output, the differential and any model outputs.

**Safety layer**
- **Gates.** Image quality, DICOM header consistency, out-of-distribution (autoencoder) and anatomy / body-region gates. A failed gate returns *Image rejected* with the reason and no findings.
- **Honest scores.** Scores are model outputs, not probabilities. Confidence thresholds are configurable, and findings the models disagree on are marked *Uncertain – physician review required*.
- **Grounded language.** The report LLM never sees the image: findings it mentions that the models did not produce are removed and reported. The vision-language assessment does see the image; its likelihoods are capped, labelled as estimates and always shown with a fixed disclaimer.
- **Human in the loop.** Every result is a draft until a doctor signs it; the differential is labelled as estimates, never a diagnosis.
- **Monitoring.** The Safety monitor shows agreement and override rates per pathology over time, rejected images, low-confidence and model-disagreement rates.

**Education.** Training mode offers blind reads of signed cases scored against the signing doctor's decision, per-pathology progress, and a *When the AI was wrong* collection.

**Platform.** Uzbek (default), English and Russian UI and reports; a dashboard with measured turnaround and agreement; a public landing page.

## Quick start

With Docker:

```bash
cp .env.example .env                 # set SECRET_KEY, PSEUDONYM_KEY (required), GROQ_API_KEY (optional)
docker compose up --build            # http://localhost:8080  (API docs: http://localhost:8000/docs)
docker compose exec backend python scripts/download_samples.py   # optional: demo images…
docker compose exec backend python scripts/seed_demo.py          # …and demo accounts and cases
```

Locally (Python 3.11 and Node 22+; SQLite by default; on Windows use `backend\.venv\Scripts\python`):

```bash
python3.11 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements-dev.txt
(cd frontend && npm ci) && cp backend/.env.example backend/.env
backend/.venv/bin/python scripts/download_samples.py   # public sample images (samples/SOURCES.md) and samples/demo/, sorted by category with DICOMs and a README of what to show
backend/.venv/bin/python scripts/seed_demo.py          # demo accounts and ~15 cases
backend/.venv/bin/python scripts/dev.py                # http://localhost:5173
```

On Linux or macOS, `make setup samples seed dev` does the same. Model weights (~670 MB) download on first start.

### Demo accounts

Password: `MedNexus-Demo-2026`

| Email | Role |
|---|---|
| `doctor@mednexus.uz` | Doctor: new case (intake → differential), dashboard, worklist, review and sign-off, compare, training, Safety monitor |

### Tests

```bash
cd backend && .venv/bin/python -m pytest                    # API, auth, security, pipeline, chat, workflow
MEDNEXUS_TEST_DATABASE_URL=postgresql://… .venv/bin/python -m pytest   # same suite on PostgreSQL
cd frontend && npm run typecheck && npm run lint && npm run build
cd frontend && npm run test:e2e                             # Playwright: sign in → analyze → chat → sign → worklist
```

## Architecture

```
frontend/   React · Vite · TypeScript · Tailwind · framer-motion · i18n (uz/en/ru)
backend/
  analyzers.yaml     registry: analyzers per modality / region / view, triage rules
  app/analyzers/     plugins: quality & DICOM gates, chest_xray/ (OOD, anatomy, ensemble), extremity_xray/ (region gate, fracture), brain_mri/ (tumor classifier)
  app/services/assessment.py   image + symptoms → differential with the vision-language model (estimates ≤ 90 %)
  app/services/      pipeline, analysis & review, reporting & chat (LLM), triage, compare, training, stats, uploads, background queue
  app/db/            SQLModel tables, Alembic migrations (PostgreSQL or SQLite), hash-chained audit log
  app/api/           FastAPI routes: auth, users, analyze, cases (worklist, review, report, chat), compare, training, stats
```

For each study, every analyzer that `supports()` its modality, region and view runs. Gates run first, and the first failed blocking check stops the pipeline. The LLM only ever receives the structured result.

**Adding a model** takes one class and one registry entry; the frontend needs no changes. The extremity fracture detector was added this way:

```python
# backend/app/analyzers/extremity_xray/fracture.py
class FractureDetector(Analyzer):
    label = "Fracture detector (YOLOv7, GRAZPEDWRI-DX)"
    provides_findings = True

    def load(self, device): ...                            # load weights once at startup
    def analyze(self, image, context) -> AnalyzerResult:
        return AnalyzerResult(self.id, findings=[...])     # findings with scores, levels and boxes
```

```yaml
# backend/analyzers.yaml
  - id: extremity_fracture
    class: app.analyzers.extremity_xray.fracture:FractureDetector
    applies_to: [{modality: xray, region: extremity, views: [PA, AP, Lateral]}]
    params: {weights_url: …, thresholds: {report: 0.40, moderate: 0.55, high: 0.70}}
```

A vision-language model fits the same interface: it returns findings, and optionally heatmaps, masks or boxes.

## Models and credits

| Component | Source | License |
|---|---|---|
| DenseNet-121 `densenet121-res224-all`, ResNet-50 `resnet50-res512-all` | [torchxrayvision](https://github.com/mlmed/torchxrayvision), Cohen et al., *MIDL 2022* | Apache-2.0 |
| ResNet autoencoder `101-elastic` (out-of-distribution gate) | torchxrayvision | Apache-2.0 |
| PSPNet anatomy segmentation | torchxrayvision, trained on [ChestX-Det](https://github.com/Deepwise-AILab/ChestX-Det-Dataset) (Lian et al., 2021) | Apache-2.0 |
| YOLOv7-p6 fracture detector (ONNX) | [YOLOv7-Bone-Fracture-Detection](https://github.com/mdciri/YOLOv7-Bone-Fracture-Detection), trained on [GRAZPEDWRI-DX](https://doi.org/10.1038/s41597-022-01328-z) (pediatric wrist radiographs) | GPL-3.0 (weights downloaded at runtime; dataset CC BY 4.0) |
| ViT-B/16 brain tumor classifier (brain MRI: glioma, meningioma, pituitary tumor, no tumor) | [Hemg/Brain-Tumor-Classification](https://huggingface.co/Hemg/Brain-Tumor-Classification) on Hugging Face, fine-tuned from `google/vit-base-patch16-224-in21k`; label set of the Kaggle [Brain Tumor MRI Dataset](https://www.kaggle.com/datasets/masoudnickparvar/brain-tumor-mri-dataset) (training data not named on the model card) | Apache-2.0 (weights downloaded at runtime) |
| Grad-CAM | [pytorch-grad-cam](https://github.com/jacobgil/pytorch-grad-cam) | MIT |
| Report and chat LLM (default `openai/gpt-oss-120b`, set with `GROQ_MODEL`) | [Groq API](https://console.groq.com/docs/models) | Apache-2.0 model weights; Groq terms of service |
| Vision-language assessment: image + symptoms → differential (default `qwen/qwen3.8-27b`, set with `GROQ_VISION_MODEL`) | [Groq API](https://console.groq.com/docs/models), open-weight Qwen | Apache-2.0 model weights; Groq terms of service |

Sample images: see [samples/SOURCES.md](samples/SOURCES.md) (CC0, public domain, CC BY / CC BY-SA with attribution, NIH ChestX-ray14).

## Security notes

- **Accounts.**
  - Passwords are hashed with argon2id.
  - Sessions use short-lived JWT access tokens and rotating refresh tokens, stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
  - CSRF uses a double-submit token.
  - Signing out, or changing a password or role, revokes all refresh tokens.
- **Abuse protection.** Sign-in and analysis are rate-limited, and an account locks after repeated failed sign-ins. The rate limiter is in-memory, one API process; use a shared store if you scale out.
- **Access control.**
  - Only physicians can register; every endpoint requires a signed-in doctor.
  - Everyone sees only their own cases.
  - The training pool contains signed, pseudonymous cases.
- **Uploads.**
  - File type is checked by magic bytes and size is limited.
  - DICOM files are anonymized on upload: identifying attributes and private tags are removed and UIDs replaced.
  - Raster images are re-encoded without metadata.
  - Patients appear only as pseudonyms (`PX-…`, derived with HMAC from the DICOM PatientID).
- **Audit log.** Append-only (database triggers refuse UPDATE and DELETE) and hash-chained with SHA-256; *Audit chain intact* in the worklist verifies it.
- **Configuration.**
  - Every response carries security headers, and CORS is strict.
  - All secrets come from environment variables (see `.env.example` and `backend/.env.example`); none are committed.

## Disclaimer

Research prototype. Not a certified medical device. It does not diagnose. All output is AI decision support that requires confirmation by a qualified physician. No clinical accuracy is claimed.
