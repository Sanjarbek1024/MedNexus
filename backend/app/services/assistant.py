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
- Be concise and structured (short paragraphs or bullets). Answer in {language}.

Case data (JSON):
{case}"""

INTERVAL_SYSTEM_PROMPT = """\
You compare two AI analyses of the same patient for a radiologist. You never see the images; \
you only receive JSON with the model score for each pathology in the prior and current study.

Rules:
- Describe only the changes listed. Never add findings or diagnoses.
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
    llm: LLM, result: AnalysisResult, history: Sequence[ChatMessageOut], message: str, language: str
) -> Iterator[str]:
    system = CHAT_SYSTEM_PROMPT.format(
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
        "changes": [d.model_dump() for d in deltas if d.trend != "stable" or d.reported],
    }
    raw = llm.json_completion(
        INTERVAL_SYSTEM_PROMPT.format(language=LANGUAGES[language].prompt_name), payload, 800
    )
    summary = str(json.loads(raw).get("summary", "")).strip()
    if not summary:
        raise ValueError("empty interval summary")
    return summary
