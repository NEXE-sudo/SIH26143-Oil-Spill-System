"""
Loads configs/*.yaml (roadmap §63) so services/ never hard-codes scientific
parameters. Cached per-process; call reload() in tests if a config file
changes mid-run.
"""

from __future__ import annotations

import functools
from pathlib import Path
from typing import Any, Dict

import yaml

from app.config import CONFIGS_DIR


def _load(name: str) -> Dict[str, Any]:
    path = Path(CONFIGS_DIR) / name
    if not path.exists():
        return {}
    with open(path, "r") as f:
        return yaml.safe_load(f) or {}


@functools.lru_cache(maxsize=None)
def detection() -> Dict[str, Any]:
    return _load("detection.yaml")


@functools.lru_cache(maxsize=None)
def drift() -> Dict[str, Any]:
    return _load("drift.yaml")


@functools.lru_cache(maxsize=None)
def attribution() -> Dict[str, Any]:
    return _load("attribution.yaml")


def reload() -> None:
    detection.cache_clear()
    drift.cache_clear()
    attribution.cache_clear()
