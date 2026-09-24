"""Public API models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class ViewOption(BaseModel):
    id: str
    label: str
    supported: bool
    analyzers: list[str]


class RegionOption(BaseModel):
    id: str
    label: str
    supported: bool
    views: list[ViewOption]


class ModalityOption(BaseModel):
    id: str
    label: str
    supported: bool
    regions: list[RegionOption]


class LanguageOption(BaseModel):
    id: str
    label: str


class Capabilities(BaseModel):
    modalities: list[ModalityOption]
    languages: list[LanguageOption]
    default_language: str


class AnalyzerStatus(BaseModel):
    id: str
    label: str
    versions: dict[str, str]


class LLMStatus(BaseModel):
    provider: Literal["groq"] = "groq"
    model: str
    configured: bool


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    version: str
    device: str
    analyzers: list[AnalyzerStatus]
    llm: LLMStatus
