"""
Central app settings. Scientific/tunable parameters (detection thresholds,
AIS radius/window, attribution weights, drift duration) belong in
configs/*.yaml per roadmap §63 — not here. This module only holds
service-level config (CORS, env, paths).
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
CONFIGS_DIR = BACKEND_ROOT.parent / "configs"

CORS_ALLOW_ORIGINS = os.environ.get(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

ENV = os.environ.get("APP_ENV", "development")
