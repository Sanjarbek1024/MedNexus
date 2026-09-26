"""Thin wrapper around the Groq chat API (JSON completions and token streaming)."""

from __future__ import annotations

import json
from collections.abc import Iterator

from groq import Groq


class LLMUnavailableError(RuntimeError):
    pass


class LLM:
    def __init__(self, api_key: str | None, model: str, timeout_s: float, max_retries: int = 1) -> None:
        self.model = model
        self._client = Groq(api_key=api_key, timeout=timeout_s, max_retries=max_retries) if api_key else None

    @property
    def configured(self) -> bool:
        return self._client is not None

    def _options(self) -> dict:
        if self.model.startswith("openai/gpt-oss"):
            return {"reasoning_effort": "low"}
        if self.model.startswith("qwen/"):
            return {"reasoning_effort": "none"}  # answer directly, without a thinking trace
        return {}

    def _require_client(self) -> Groq:
        if self._client is None:
            raise LLMUnavailableError("GROQ_API_KEY is not configured")
        return self._client

    def json_completion(
        self, system: str, payload: dict, max_tokens: int = 2048, reasoning_effort: str | None = None
    ) -> str:
        completion = self._require_client().chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_completion_tokens=max_tokens,
            **({**self._options(), "reasoning_effort": reasoning_effort} if reasoning_effort else self._options()),
        )
        return completion.choices[0].message.content or ""

    def image_json_completion(self, system: str, text: str, image_url: str, max_tokens: int = 2048) -> str:
        """JSON completion over one image (a data URL) plus text, for vision-language models."""
        completion = self._require_client().chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": [
                    {"type": "text", "text": text},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ]},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_completion_tokens=max_tokens,
            **self._options(),
        )
        return completion.choices[0].message.content or ""

    def stream(self, messages: list[dict], max_tokens: int = 1200) -> Iterator[str]:
        chunks = self._require_client().chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.3,
            max_completion_tokens=max_tokens,
            stream=True,
            **self._options(),
        )
        for chunk in chunks:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
