"""JSON stdin/stdout wrapper around optimize_production() for the Node
backend's subprocess integration (server/services/optimization.ts).

Reads a JSON object from stdin: {"sku_data"?, "resource_limits"?, "scenario"?}.
Missing sku_data/resource_limits default to this module's own illustrative
demo dataset — never real Grandiose data (see optimization_engine.py's
module docstring).

Always exits 0 and prints a well-formed JSON envelope for both success and
every *expected* failure (bad JSON, invalid input shape, infeasible result —
which optimize_production() itself already returns as normal data, not an
exception). Only a genuinely unexpected bug should produce a traceback and a
non-zero exit; the Node caller treats that case as a process failure.
"""

from __future__ import annotations

import json
import sys

from optimization_engine import (
    DEMO_RESOURCE_LIMITS,
    DEMO_SKU_DATA,
    OptimizationInputError,
    optimize_production,
)


def main() -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        if not isinstance(payload, dict):
            raise TypeError("request body must be a JSON object")

        sku_data = payload.get("sku_data") or DEMO_SKU_DATA
        resource_limits = payload.get("resource_limits") or DEMO_RESOURCE_LIMITS
        scenario = payload.get("scenario")

        result = optimize_production(sku_data, resource_limits, scenario)
    except (json.JSONDecodeError, OptimizationInputError, KeyError, TypeError, AttributeError) as exc:
        print(json.dumps({"ok": False, "error": {"type": type(exc).__name__, "message": str(exc)}}))
        return 0

    print(json.dumps({"ok": True, "result": result}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
