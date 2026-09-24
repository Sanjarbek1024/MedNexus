"""Physician-facing narrative report, written by an LLM from the models' structured outputs.

The LLM never sees the image. It receives only the JSON the image models produced and must
not introduce findings of its own: its output is validated, anything that does not match a
model finding is dropped and recorded, and scores and levels always come from the models.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from groq import Groq
from pydantic import BaseModel, Field, ValidationError

from app.languages import LANGUAGES
from app.schemas import AnalysisResult, CheckStatus, Report

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You write decision-support notes for a physician who is reviewing AI outputs for a medical \
image. You never see the image. You only receive JSON produced by image-analysis models.

Rules:
1. Discuss only the findings listed in "findings". Never add, rename, merge or infer any other finding, disease or diagnosis.
2. "not_flagged" lists pathologies the models scored below the reporting threshold. Do not list them one by one and never call them "not assessed". "not_assessed" lists pathologies these models cannot evaluate at all.
3. Do not diagnose. Call them "AI findings" that require physician confirmation. Never claim the AI is as accurate as or more accurate than a physician.
4. Scores are model scores normalized so that 0.50 is the model's decision threshold. They are NOT probabilities: never turn them into percentages or likelihoods.
5. Describe findings with level "uncertain" as uncertain and needing physician review. Mention when the two models disagree.
6. If "findings" is empty, say that no finding reached the reporting threshold and that this does not rule out disease.
7. Each finding's "explanation" says in plain language what the finding means on a radiograph and what it can be associated with (1-2 sentences).
8. "next_steps": 2-4 short suggestions for the physician that follow from the findings (for example clinical correlation, comparison with prior imaging, an additional view). Never give treatment instructions.
9. "limitations": 2-4 short items: relevant warnings from "safety_checks", what the models cannot assess, and that the scores are not probabilities.
10. Write every text value in natural, grammatical {language}, using standard medical terminology of that language.

Return only a JSON object of exactly this shape:
{{"summary": "2-4 sentences",
  "findings": [{{"name": "<exact name from the input>", "explanation": "1-2 sentences"}}],
  "next_steps": ["..."],
  "limitations": ["..."]}}"""


class _LLMFinding(BaseModel):
    name: str
    explanation: str


class _LLMReport(BaseModel):
    summary: str
    findings: list[_LLMFinding] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class ReportOutcome:
    report: Report | None
    explanations: dict[str, str]
    error: str | None = None


class ReportWriter:
    def __init__(self, api_key: str | None, model: str, timeout_s: float) -> None:
        self.model = model
        self._client = Groq(api_key=api_key, timeout=timeout_s, max_retries=1) if api_key else None

    @property
    def configured(self) -> bool:
        return self._client is not None

    def write(self, result: AnalysisResult, language: str) -> ReportOutcome:
        if self._client is None:
            return ReportOutcome(None, {}, "GROQ_API_KEY is not configured")
        try:
            raw = self._complete(build_prompt_payload(result), language)
            return ground(_LLMReport.model_validate_json(raw), result, language, self.model)
        except ValidationError:
            logger.warning("LLM returned JSON that does not match the report schema")
            return ReportOutcome(None, {}, "the language model returned an invalid report")
        except Exception as exc:  # network, auth, rate limit, timeout
            logger.warning("LLM report failed: %s", exc)
            return ReportOutcome(None, {}, f"the language model is unavailable ({type(exc).__name__})")

    def _complete(self, payload: dict, language: str) -> str:
        options = {"reasoning_effort": "low"} if self.model.startswith("openai/gpt-oss") else {}
        completion = self._client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT.format(language=LANGUAGES[language].prompt_name),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_completion_tokens=2048,
            **options,
        )
        return completion.choices[0].message.content or ""


def build_prompt_payload(result: AnalysisResult) -> dict:
    """The only information the LLM receives: structured model outputs, no image."""
    return {
        "study": result.selection.model_dump(exclude={"language"}),
        "score_scale": "0-1 model score; 0.50 = model decision threshold; not a probability",
        "findings": [
            {
                "name": f.name,
                "score": round(f.score, 2),
                "level": f.level,
                "models_agree": f.models_agree,
            }
            for f in result.findings
        ],
        "not_flagged": [s.name for s in result.other_scores],
        "not_assessed": result.not_assessed,
        "measurements": [
            {"name": m.label, "value": m.value, "reference": m.reference, "note": m.detail}
            for m in result.measurements
        ],
        "safety_checks": [
            {"check": c.label, "status": c.status, "detail": c.detail}
            for c in result.checks
            if c.status != CheckStatus.PASS
        ],
    }


def ground(llm: _LLMReport, result: AnalysisResult, language: str, model: str) -> ReportOutcome:
    """Keep only what the image models support."""
    known = {f.name.casefold(): f.name for f in result.findings}
    explanations: dict[str, str] = {}
    removed: list[str] = []
    for item in llm.findings:
        name = known.get(item.name.strip().casefold())
        if name is None:
            removed.append(item.name)
        else:
            explanations[name] = item.explanation.strip()
    report = Report(
        language=language,
        model=model,
        summary=llm.summary.strip(),
        next_steps=[s.strip() for s in llm.next_steps if s.strip()],
        limitations=[s.strip() for s in llm.limitations if s.strip()],
        removed_findings=removed,
    )
    return ReportOutcome(report, explanations)
