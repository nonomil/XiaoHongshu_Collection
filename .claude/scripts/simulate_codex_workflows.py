#!/usr/bin/env python3
"""兼容入口：桥接到 .codex/scripts/simulate_codex_workflows.py。"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


TARGET_PATH = Path(__file__).resolve().parents[2] / ".codex" / "scripts" / "simulate_codex_workflows.py"
sys.path.insert(0, str(TARGET_PATH.parent))
SPEC = importlib.util.spec_from_file_location("codex_bridge_simulate_codex_workflows", TARGET_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)

for NAME in dir(MODULE):
    if not NAME.startswith("__"):
        globals()[NAME] = getattr(MODULE, NAME)


if __name__ == "__main__":
    raise SystemExit(MODULE.main())
