import json
from datetime import datetime, timezone
from types import SimpleNamespace

from app.analyzers.base import Level
from app.schemas import AnalysisResult, CaseStatus, FindingOut, ImageOut, Selection
from app.services.llm import LLM
from app.services.reporting import ReportWriter, build_prompt_payload


def result_with(*names: str) -> AnalysisResult:
    return AnalysisResult(
        created_at=datetime.now(timezone.utc),
        status=CaseStatus.AI_READY,
        selection=Selection(modality="xray", region="chest", view="PA", language="en"),
        image=ImageOut(url="data:", width=1, height=1, format="png", sha256="0" * 64),
        rejected=False, rejection_reasons=[], checks=[],
        findings=[
            FindingOut(name=n, score=0.8, level=Level.HIGH, model_scores={}, models_agree=True)
            for n in names
        ],
        other_scores=[], not_assessed=[], thresholds={}, structures=[], measurements=[],
        versions={}, timings_ms={},
    )


class FakeCompletions:
    def __init__(self, content: str | Exception) -> None:
        self.content = content
        self.calls: list[dict] = []

    def create(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        if isinstance(self.content, Exception):
            raise self.content
        message = SimpleNamespace(content=self.content)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def writer_returning(content: str | Exception) -> tuple[ReportWriter, FakeCompletions]:
    llm = LLM("test-key", "openai/gpt-oss-120b", 5)
    completions = FakeCompletions(content)
    llm._client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return ReportWriter(llm), completions


def test_findings_the_models_did_not_produce_are_removed() -> None:
    writer, completions = writer_returning(json.dumps({
        "summary": "AI findings suggest consolidation.",
        "findings": [
            {"name": "consolidation", "local_name": "Konsolidatsiya", "explanation": "Airspace filling."},
            {"name": "Tuberculosis", "explanation": "Invented by the LLM."},
        ],
        "next_steps": ["Correlate clinically."],
        "limitations": ["Scores are not probabilities."],
    }))
    outcome = writer.write(result_with("Consolidation"), "en")

    assert outcome.report is not None
    assert outcome.report.removed_findings == ["Tuberculosis"]
    assert outcome.explanations == {"Consolidation": "Airspace filling."}
    assert outcome.local_names == {"Consolidation": "Konsolidatsiya"}
    request = completions.calls[0]
    assert request["response_format"] == {"type": "json_object"}
    assert "English" in request["messages"][0]["content"]


def test_the_llm_never_receives_the_image() -> None:
    payload = json.dumps(build_prompt_payload(result_with("Effusion")))
    assert "data:" not in payload and "sha256" not in payload


def test_llm_failure_falls_back_to_model_results() -> None:
    writer, _ = writer_returning(TimeoutError("slow"))
    outcome = writer.write(result_with("Effusion"), "uz")
    assert outcome.report is None
    assert "unavailable" in outcome.error


def test_malformed_llm_output_is_rejected() -> None:
    writer, _ = writer_returning('{"text": "free-form answer"}')
    outcome = writer.write(result_with("Effusion"), "ru")
    assert outcome.report is None and "invalid" in outcome.error


def test_missing_api_key_disables_the_report() -> None:
    outcome = ReportWriter(LLM(None, "openai/gpt-oss-120b", 5)).write(result_with("Effusion"), "en")
    assert outcome.report is None and "GROQ_API_KEY" in outcome.error
