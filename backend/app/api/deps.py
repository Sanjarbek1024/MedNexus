"""Request-scoped access to the services created at startup."""

from typing import Annotated

import torch
from fastapi import Depends, Request

from app.analyzers.registry import AnalyzerRegistry


def _registry(request: Request) -> AnalyzerRegistry:
    return request.app.state.registry


def _device(request: Request) -> torch.device:
    return request.app.state.device


Registry = Annotated[AnalyzerRegistry, Depends(_registry)]
Device = Annotated[torch.device, Depends(_device)]
