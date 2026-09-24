"""Analyzer registry: builds analyzer plugins from ``analyzers.yaml``."""

from __future__ import annotations

import importlib
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import torch
import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.analyzers.base import Analyzer, Scope, Stage
from app.languages import DEFAULT_LANGUAGE, LANGUAGES
from app.schemas import (
    Capabilities,
    LanguageOption,
    ModalityOption,
    RegionOption,
    ViewOption,
)

_STAGE_ORDER = list(Stage)


class RegistryError(ValueError):
    """``analyzers.yaml`` is invalid."""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class TaxonomyItem(_Strict):
    id: str
    label: str


class ModalityItem(TaxonomyItem):
    views: list[str]


class Taxonomy(_Strict):
    modalities: list[ModalityItem]
    regions: list[TaxonomyItem]


class ScopeConfig(_Strict):
    modality: str | None = None
    region: str | None = None
    views: list[str] | None = None


class AnalyzerConfig(_Strict):
    id: str
    class_path: str = Field(alias="class")
    applies_to: list[ScopeConfig]
    params: dict[str, Any] = Field(default_factory=dict)


class TriageConfig(_Strict):
    # Findings that make a case "urgent" when an analyzer reports them at high confidence.
    urgent_findings: list[str] = Field(default_factory=list)


class RegistryConfig(_Strict):
    taxonomy: Taxonomy
    analyzers: list[AnalyzerConfig] = Field(default_factory=list)
    triage: TriageConfig = Field(default_factory=TriageConfig)

    @model_validator(mode="after")
    def _check_references(self) -> RegistryConfig:
        modalities = {m.id: set(m.views) for m in self.taxonomy.modalities}
        regions = {r.id for r in self.taxonomy.regions}
        ids = [a.id for a in self.analyzers]
        if len(ids) != len(set(ids)):
            raise ValueError("analyzer ids must be unique")
        for analyzer in self.analyzers:
            for scope in analyzer.applies_to:
                if scope.modality is not None and scope.modality not in modalities:
                    raise ValueError(f"{analyzer.id}: unknown modality '{scope.modality}'")
                if scope.region is not None and scope.region not in regions:
                    raise ValueError(f"{analyzer.id}: unknown region '{scope.region}'")
                known_views = (
                    modalities[scope.modality]
                    if scope.modality
                    else set().union(*modalities.values())
                )
                unknown = set(scope.views or []) - known_views
                if unknown:
                    raise ValueError(f"{analyzer.id}: unknown views {sorted(unknown)}")
        return self


class AnalyzerRegistry:
    def __init__(
        self, taxonomy: Taxonomy, analyzers: Sequence[Analyzer], urgent_findings: Sequence[str] = ()
    ) -> None:
        self.taxonomy = taxonomy
        self.analyzers = tuple(analyzers)
        self.urgent_findings = frozenset(urgent_findings)

    @classmethod
    def from_yaml(cls, path: Path) -> AnalyzerRegistry:
        try:
            config = RegistryConfig.model_validate(yaml.safe_load(path.read_text("utf-8")))
        except (yaml.YAMLError, ValueError) as exc:
            raise RegistryError(f"{path.name}: {exc}") from exc
        analyzers = [_build(entry) for entry in config.analyzers]
        return cls(config.taxonomy, analyzers, config.triage.urgent_findings)

    def load(self, device: torch.device) -> None:
        for analyzer in self.analyzers:
            analyzer.load(device)

    def pipeline(self, modality: str, region: str, view: str) -> list[Analyzer]:
        """Analyzers for a study, gates first, otherwise in declaration order."""
        selected = [a for a in self.analyzers if a.supports(modality, region, view)]
        return sorted(selected, key=lambda a: _STAGE_ORDER.index(a.stage))

    def is_supported(self, modality: str, region: str, view: str) -> bool:
        return any(a.provides_findings for a in self.pipeline(modality, region, view))

    def capabilities(self) -> Capabilities:
        modalities = []
        for modality in self.taxonomy.modalities:
            regions = []
            for region in self.taxonomy.regions:
                views = [
                    ViewOption(
                        id=view,
                        label=view,
                        supported=self.is_supported(modality.id, region.id, view),
                        analyzers=[a.label for a in self.pipeline(modality.id, region.id, view)],
                    )
                    for view in modality.views
                ]
                regions.append(
                    RegionOption(
                        id=region.id,
                        label=region.label,
                        supported=any(v.supported for v in views),
                        views=views,
                    )
                )
            modalities.append(
                ModalityOption(
                    id=modality.id,
                    label=modality.label,
                    supported=any(r.supported for r in regions),
                    regions=regions,
                )
            )
        return Capabilities(
            modalities=modalities,
            languages=[LanguageOption(id=lang.code, label=lang.label) for lang in LANGUAGES.values()],
            default_language=DEFAULT_LANGUAGE,
        )


def _build(entry: AnalyzerConfig) -> Analyzer:
    module_name, _, class_name = entry.class_path.partition(":")
    try:
        analyzer_cls = getattr(importlib.import_module(module_name), class_name)
    except (ImportError, AttributeError) as exc:
        raise RegistryError(f"{entry.id}: cannot import '{entry.class_path}'") from exc
    if not (isinstance(analyzer_cls, type) and issubclass(analyzer_cls, Analyzer)):
        raise RegistryError(f"{entry.id}: '{entry.class_path}' is not an Analyzer")

    scopes = [
        Scope(s.modality, s.region, frozenset(s.views) if s.views is not None else None)
        for s in entry.applies_to
    ]
    try:
        return analyzer_cls(entry.id, scopes, **entry.params)
    except TypeError as exc:
        raise RegistryError(f"{entry.id}: invalid params: {exc}") from exc
