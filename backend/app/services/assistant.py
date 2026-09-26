"""Case chat and interval-change summaries, grounded in the stored model outputs."""

from __future__ import annotations

import json
from collections.abc import Iterator, Sequence

from app.languages import LANGUAGES
from app.schemas import AnalysisResult, ChatMessageOut, Delta
from app.services.llm import LLM
from app.services.reporting import build_prompt_payload

CHAT_SYSTEM_PROMPT = """\
You are a decision-support assistant helping a physician discuss one medical imaging case. \
You never see the image. The case data below (study, AI model outputs, safety checks, AI draft \
report and the physician's notes) is everything you know about this patient.

Rules:
- Base every statement about this case on the case data. You may add general medical knowledge \
(definitions, typical differential diagnoses, guideline-style next steps), and say when you do.
- Never invent findings, measurements or scores, and never change a model score or level. If \
asked about something the models did not assess, say so.
- Scores are model scores normalized so that 0.50 is the decision threshold; they are not \
probabilities. Never convert them into percentages or likelihoods.
- You do not diagnose. Say clearly when something needs physician judgment, clinical \
correlation or further imaging. The physician makes every decision.
- Grad-CAM heatmaps show image regions that influenced a model's score, not lesion outlines.
- Be concise. Format with short paragraphs and "-" bullet lists only: no tables, headings or HTML.
- Answer in {language}.

Case data (JSON):
{case}"""

PATIENT_CHAT_SYSTEM_PROMPT = """\
You are a kind assistant helping an ordinary person (not a doctor) understand the AI result for \
an image they uploaded themselves: an X-ray, fluorography or MRI. The case data below (study, AI \
model outputs, the symptoms they reported and the AI assessment with estimated likelihoods) is \
everything you know.

Rules:
- Use plain, calm words and explain medical terms. Do not frighten the person; be honest and \
clear about what to do next and how soon.
- You do not diagnose. Likelihoods in the assessment are estimates, never certainties: never say \
anything is 100% certain. The final decision is always made by a doctor who examines them.
- Base statements about this case on the case data; you may add general health knowledge and \
say when you do. Never invent findings or numbers.
- Do not quote raw model scores or thresholds; say in words how clearly the models flagged \
something. When you give numbers, use the estimated likelihoods of the AI assessment.
- Keep the time frame of the assessment's urgency when saying how soon to see a doctor \
(urgent = today, soon = within the next few days, routine = a planned visit), unless the person \
now describes danger signs.
- If they describe danger signs (severe breathlessness, chest pain, confusion, weakness on one \
side, heavy bleeding), tell them to call 103 or go to emergency care now.
- When useful, suggest which kind of specialist to see; the app lists recommended hospitals.
- Be concise: short paragraphs and "-" bullet lists only, no tables, headings or HTML.
- Answer in {language}.

Case data (JSON):
{case}"""

INTERVAL_SYSTEM_PROMPT = """\
You compare two AI analyses of the same patient for a radiologist. You never see the images; \
you only receive JSON with the model score for each pathology in the prior and current study.

Rules:
- Describe only the changes listed. Never add findings or diagnoses.
- Write each pathology name as the standard medical term in {language}, not in English.
- Scores are model scores (0.50 = decision threshold), not probabilities or lesion sizes. Say \
"the model score increased", never "the lesion grew".
- Mention the interval between the studies, the most relevant worsened and improved items, and \
that the changes need confirmation on the images.
- 3-5 sentences in {language}.

Return only JSON: {{"summary": "..."}}"""


def case_context(result: AnalysisResult) -> dict:
    context = build_prompt_payload(result)
    context["case_id"] = result.case_id
    context["patient"] = result.patient.pseudonym if result.patient else None
    context["priority"] = result.priority
    context["heatmaps_for"] = [f.name for f in result.findings if f.heatmap]
    context["reported_symptoms"] = result.symptoms
    context["age"] = result.patient_age
    context["sex"] = result.patient_sex
    if result.assessment:
        context["ai_assessment"] = result.assessment.model_dump(exclude={"model", "language", "disclaimer"})
    if result.report:
        context["ai_draft_report"] = {
            "summary": result.report.summary,
            "next_steps": result.report.next_steps,
            "limitations": result.report.limitations,
        }
    if result.physician_report:
        context["physician_report"] = result.physician_report.model_dump(
            include={"findings", "impression", "recommendations", "status"}
        )
    if result.review:
        context["physician_review"] = {
            "action": result.review.action,
            "notes": result.review.notes,
            "finding_decisions": result.review.finding_decisions,
            "added_findings": result.review.added_findings,
        }
    return context


def chat_stream(
    llm: LLM,
    result: AnalysisResult,
    history: Sequence[ChatMessageOut],
    message: str,
    language: str,
    audience: str = "doctor",
) -> Iterator[str]:
    template = PATIENT_CHAT_SYSTEM_PROMPT if audience == "patient" else CHAT_SYSTEM_PROMPT
    system = template.format(
        language=LANGUAGES[language].prompt_name,
        case=json.dumps(case_context(result), ensure_ascii=False, default=str),
    )
    messages = [{"role": "system", "content": system}]
    messages += [{"role": m.role, "content": m.content} for m in history[-12:]]
    messages.append({"role": "user", "content": message})
    return llm.stream(messages)


def interval_summary(llm: LLM, deltas: Sequence[Delta], interval_days: float, language: str) -> str:
    payload = {
        "interval_days": round(interval_days, 1),
        "changes": [
            {
                **d.model_dump(),
                **{k: round(getattr(d, k), 2) for k in ("prior", "current", "change") if getattr(d, k) is not None},
            }
            for d in deltas
            if d.trend != "stable" or d.reported
        ],
    }
    raw = llm.json_completion(
        INTERVAL_SYSTEM_PROMPT.format(language=LANGUAGES[language].prompt_name), payload, 800
    )
    summary = str(json.loads(raw).get("summary", "")).strip()
    if not summary:
        raise ValueError("empty interval summary")
    return summary
