"""Grandiose Bakery — Production Mix Optimization Engine.

Bakery only. Catering is excluded.

Deterministic mathematical optimization: for each SKU, decide the
production quantity that maximizes total contribution margin subject to
demand, commercial-minimum, labour, oven, flour, and butter constraints.
This module is the sole source of truth for optimal production
quantities and their financial results — no AI/LLM may compute or
override these figures.

All data in DEMO_SKU_DATA / DEMO_RESOURCE_LIMITS below is ILLUSTRATIVE /
DEMO DATA for development and testing. It must never be presented as
actual Grandiose Bakery operating data.

Run directly (`python optimization_engine.py`) to reproduce the
validated baseline run from a terminal, exactly as the original
prototype did. Import `optimize_production` to use this as a library —
it has no import-time side effects and prints nothing itself.
"""

from __future__ import annotations

import copy
from typing import Any

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp

# ------------------------------------------------------------
# Model constants
# ------------------------------------------------------------

# Order also fixes the column order of the resource-usage matrix A.
RESOURCE_NAMES: tuple[str, ...] = ("labour_minutes", "oven_minutes", "flour_kg", "butter_kg")

REQUIRED_SKU_FIELDS: tuple[str, ...] = (
    "sku",
    "selling_price",
    "variable_cost",
    "current_production",
    "forecast_demand",
    "retail_minimum",
    "b2b_commitment",
    "labour_minutes",
    "oven_minutes",
    "flour_kg",
    "butter_kg",
)

_NON_NEGATIVE_SKU_FIELDS: tuple[str, ...] = tuple(f for f in REQUIRED_SKU_FIELDS if f != "sku")

# Resource slack at/below this (in the resource's own unit) is reported as
# a binding constraint — matches the prototype's reporting tolerance.
BINDING_TOLERANCE = 0.01


class OptimizationInputError(ValueError):
    """Raised when sku_data / resource_limits fail validation before solving."""


# ------------------------------------------------------------
# Illustrative demo dataset (5 SKUs) — see module docstring.
# ------------------------------------------------------------

DEMO_SKU_DATA: list[dict[str, Any]] = [
    {
        "sku": "Croissant",
        "selling_price": 8.00,
        "variable_cost": 3.20,
        "current_production": 900,
        "forecast_demand": 1200,
        "retail_minimum": 500,
        "b2b_commitment": 350,
        "labour_minutes": 3.0,
        "oven_minutes": 1.8,
        "flour_kg": 0.080,
        "butter_kg": 0.030,
    },
    {
        "sku": "Pain au Chocolat",
        "selling_price": 9.00,
        "variable_cost": 3.80,
        "current_production": 600,
        "forecast_demand": 850,
        "retail_minimum": 350,
        "b2b_commitment": 200,
        "labour_minutes": 3.5,
        "oven_minutes": 2.0,
        "flour_kg": 0.085,
        "butter_kg": 0.032,
    },
    {
        "sku": "Danish",
        "selling_price": 10.00,
        "variable_cost": 4.60,
        "current_production": 450,
        "forecast_demand": 700,
        "retail_minimum": 250,
        "b2b_commitment": 350,
        "labour_minutes": 4.0,
        "oven_minutes": 2.5,
        "flour_kg": 0.090,
        "butter_kg": 0.035,
    },
    {
        "sku": "Brioche",
        "selling_price": 7.00,
        "variable_cost": 2.90,
        "current_production": 650,
        "forecast_demand": 900,
        "retail_minimum": 400,
        "b2b_commitment": 150,
        "labour_minutes": 2.5,
        "oven_minutes": 1.5,
        "flour_kg": 0.075,
        "butter_kg": 0.025,
    },
    {
        "sku": "Cinnamon Roll",
        "selling_price": 8.50,
        "variable_cost": 3.40,
        "current_production": 550,
        "forecast_demand": 800,
        "retail_minimum": 300,
        "b2b_commitment": 250,
        "labour_minutes": 3.2,
        "oven_minutes": 2.0,
        "flour_kg": 0.080,
        "butter_kg": 0.028,
    },
]

# "Normal" available resources (brief §NORMAL AVAILABLE RESOURCES).
DEMO_RESOURCE_LIMITS: dict[str, float] = {
    "labour_minutes": 9985,
    "oven_minutes": 6020,
    "flour_kg": 256.25,
    "butter_kg": 93.60,
}


# ------------------------------------------------------------
# Validation
# ------------------------------------------------------------


def _validate_sku_data(sku_data: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []

    if not sku_data:
        return ["At least one SKU is required."]

    seen: set[str] = set()
    for idx, row in enumerate(sku_data):
        if not isinstance(row, dict):
            errors.append(f"SKU entry at position {idx} must be a dict of fields.")
            continue

        missing = [f for f in REQUIRED_SKU_FIELDS if f not in row]
        if missing:
            errors.append(f"SKU at position {idx} is missing required field(s): {', '.join(missing)}.")
            continue

        label = row["sku"]

        if not isinstance(label, str) or not label.strip():
            errors.append(f"SKU identifier at position {idx} must be a non-empty string.")
        elif label in seen:
            errors.append(f"Duplicate SKU identifier: '{label}'.")
        else:
            seen.add(label)

        for field in _NON_NEGATIVE_SKU_FIELDS:
            value = row[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                errors.append(f"SKU '{label}': field '{field}' must be numeric.")
            elif value < 0:
                errors.append(f"SKU '{label}': field '{field}' cannot be negative (got {value}).")

        numeric_min_fields = ("retail_minimum", "b2b_commitment", "forecast_demand")
        if all(not isinstance(row[f], bool) and isinstance(row[f], (int, float)) for f in numeric_min_fields):
            effective_minimum = max(row["retail_minimum"], row["b2b_commitment"])
            if effective_minimum > row["forecast_demand"]:
                errors.append(
                    f"SKU '{label}': effective minimum ({effective_minimum}) exceeds forecast demand "
                    f"({row['forecast_demand']})."
                )

    return errors


def _validate_resource_limits(resource_limits: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    if not isinstance(resource_limits, dict):
        return ["resource_limits must be a dict."]

    missing = [r for r in RESOURCE_NAMES if r not in resource_limits]
    if missing:
        errors.append(f"resource_limits is missing required key(s): {', '.join(missing)}.")

    for name in RESOURCE_NAMES:
        if name not in resource_limits:
            continue
        value = resource_limits[name]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            errors.append(f"resource_limits['{name}'] must be numeric.")
        elif value < 0:
            errors.append(f"resource_limits['{name}'] cannot be negative (got {value}).")

    return errors


# ------------------------------------------------------------
# Scenario overrides — always applied to a deep copy; baseline inputs
# passed in by the caller are never mutated.
# ------------------------------------------------------------


def _apply_scenario(
    sku_data: list[dict[str, Any]],
    resource_limits: dict[str, Any],
    scenario: dict[str, Any] | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    skus = copy.deepcopy(sku_data)
    resources = copy.deepcopy(resource_limits)

    if not scenario:
        return skus, resources

    # Applies a multiplier to one SKU-level field across every SKU —
    # e.g. {"forecast_demand": 1.10} for a "demand +10%" scenario, or
    # {"variable_cost": 1.10} for an "input costs +10%" scenario.
    for field, multiplier in scenario.get("global_sku_multipliers", {}).items():
        for row in skus:
            if field in row:
                row[field] = row[field] * multiplier

    # Per-SKU absolute field overrides — e.g. a single confirmed B2B
    # commitment change: {"Danish": {"b2b_commitment": 500}}.
    for sku_name, overrides in scenario.get("sku_overrides", {}).items():
        for row in skus:
            if row.get("sku") == sku_name:
                row.update(overrides)

    # Resource-level absolute overrides — e.g. {"flour_kg": 230.625} for
    # a "flour availability -10%" scenario.
    resources.update(scenario.get("resource_overrides", {}))

    return skus, resources


def _scenario_metadata(scenario: dict[str, Any] | None) -> dict[str, Any]:
    if not scenario:
        return {"name": "baseline", "resource_overrides": {}, "sku_overrides": {}, "global_sku_multipliers": {}}
    return {
        "name": scenario.get("name", "custom"),
        "resource_overrides": scenario.get("resource_overrides", {}),
        "sku_overrides": scenario.get("sku_overrides", {}),
        "global_sku_multipliers": scenario.get("global_sku_multipliers", {}),
    }


# ------------------------------------------------------------
# Core engine
# ------------------------------------------------------------


def optimize_production(
    sku_data: list[dict[str, Any]],
    resource_limits: dict[str, float],
    scenario: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Solve the production-mix MILP and return a structured result.

    Parameters
    ----------
    sku_data:
        One dict per SKU with the fields listed in REQUIRED_SKU_FIELDS.
        Never mutated.
    resource_limits:
        Dict with keys RESOURCE_NAMES ("labour_minutes", "oven_minutes",
        "flour_kg", "butter_kg") -> available amount. Never mutated.
        "labour_minutes" represents productive production capacity (see
        module docstring) — not paid hours, and unrelated to the
        existing TRUE EFFICIENCY / PERFORMANCE WHILE WORKING employee
        metrics elsewhere in the app.
    scenario:
        Optional overrides layered on top of baseline inputs, applied to
        a deep copy (see `_apply_scenario`). None (or omitted) solves
        the baseline as given.

    Returns
    -------
    A JSON-serializable dict. On success, `status` is "optimal" and the
    dict carries the full financial/resource/SKU breakdown. If no
    feasible plan exists, `status` is "infeasible" and the dict carries
    minimum resource requirements and shortfalls instead — this is a
    normal business outcome, not an exception.

    Raises
    ------
    OptimizationInputError
        If the effective (post-scenario) inputs fail validation.
    """
    effective_skus, effective_resources = _apply_scenario(sku_data, resource_limits, scenario)

    errors = _validate_sku_data(effective_skus) + _validate_resource_limits(effective_resources)
    if errors:
        raise OptimizationInputError(" | ".join(errors))

    scenario_metadata = _scenario_metadata(scenario)

    selling_price = np.array([row["selling_price"] for row in effective_skus], dtype=float)
    variable_cost = np.array([row["variable_cost"] for row in effective_skus], dtype=float)
    current_production = np.array([row["current_production"] for row in effective_skus], dtype=float)
    forecast_demand = np.array([row["forecast_demand"] for row in effective_skus], dtype=float)
    retail_minimum = np.array([row["retail_minimum"] for row in effective_skus], dtype=float)
    b2b_commitment = np.array([row["b2b_commitment"] for row in effective_skus], dtype=float)

    resource_columns = np.array(
        [[row[name] for row in effective_skus] for name in RESOURCE_NAMES],
        dtype=float,
    )
    resource_array = np.array([effective_resources[name] for name in RESOURCE_NAMES], dtype=float)

    contribution_margin = selling_price - variable_cost
    effective_minimum = np.maximum(retail_minimum, b2b_commitment)

    # scipy.optimize.milp minimizes, so negate to maximize contribution.
    c = -contribution_margin
    bounds = Bounds(lb=effective_minimum, ub=forecast_demand)
    constraints = LinearConstraint(resource_columns, lb=-np.inf, ub=resource_array)
    integrality = np.ones(len(effective_skus))

    result = milp(c=c, integrality=integrality, bounds=bounds, constraints=constraints)

    solver_status = {"code": int(result.status), "message": result.message}

    if not result.success:
        minimum_resource_use = resource_columns @ effective_minimum
        minimum_resource_requirements = {
            name: float(minimum_resource_use[i]) for i, name in enumerate(RESOURCE_NAMES)
        }
        resource_shortfalls = {
            name: float(max(minimum_resource_use[i] - resource_array[i], 0.0))
            for i, name in enumerate(RESOURCE_NAMES)
        }
        return {
            "status": "infeasible",
            "solver_status": solver_status,
            "message": result.message,
            "minimum_resource_requirements": minimum_resource_requirements,
            "resource_availability": {name: float(resource_array[i]) for i, name in enumerate(RESOURCE_NAMES)},
            "resource_shortfalls": resource_shortfalls,
            "effective_minimums": {
                row["sku"]: float(effective_minimum[i]) for i, row in enumerate(effective_skus)
            },
            "scenario_metadata": scenario_metadata,
        }

    optimized_production = np.rint(result.x).astype(int)

    current_revenue = float(np.sum(selling_price * current_production))
    optimized_revenue = float(np.sum(selling_price * optimized_production))
    current_variable_cost = float(np.sum(variable_cost * current_production))
    optimized_variable_cost = float(np.sum(variable_cost * optimized_production))
    current_contribution = float(np.sum(contribution_margin * current_production))
    optimized_contribution = float(np.sum(contribution_margin * optimized_production))

    contribution_improvement = optimized_contribution - current_contribution
    improvement_percentage = (
        (contribution_improvement / current_contribution * 100) if current_contribution else None
    )

    optimized_resource_use = resource_columns @ optimized_production
    current_resource_use = resource_columns @ current_production

    current_productive_labour_minutes = float(current_resource_use[RESOURCE_NAMES.index("labour_minutes")])
    optimized_productive_labour_minutes = float(optimized_resource_use[RESOURCE_NAMES.index("labour_minutes")])

    current_cm_per_hour = (
        current_contribution / (current_productive_labour_minutes / 60)
        if current_productive_labour_minutes
        else None
    )
    optimized_cm_per_hour = (
        optimized_contribution / (optimized_productive_labour_minutes / 60)
        if optimized_productive_labour_minutes
        else None
    )

    resources: list[dict[str, Any]] = []
    resource_usage: dict[str, float] = {}
    resource_availability: dict[str, float] = {}
    resource_slack: dict[str, float] = {}
    resource_utilization: dict[str, float] = {}
    binding_constraints: list[str] = []

    for i, name in enumerate(RESOURCE_NAMES):
        used = float(optimized_resource_use[i])
        available = float(resource_array[i])
        slack = available - used
        utilization_percentage = (used / available * 100) if available > 0 else 0.0
        binding = abs(slack) <= BINDING_TOLERANCE

        resource_usage[name] = used
        resource_availability[name] = available
        resource_slack[name] = slack
        resource_utilization[name] = utilization_percentage
        if binding:
            binding_constraints.append(name)

        resources.append(
            {
                "name": name,
                "used": used,
                "available": available,
                "slack": slack,
                "utilization_percentage": utilization_percentage,
                "binding": binding,
            }
        )

    sku_changes: list[dict[str, Any]] = []
    effective_minimums: dict[str, float] = {}
    current_plan: dict[str, float] = {}
    optimized_plan: dict[str, int] = {}

    for i, row in enumerate(effective_skus):
        sku = row["sku"]
        current = row["current_production"]
        optimized = int(optimized_production[i])
        absolute_change = optimized - current
        percentage_change = (absolute_change / current * 100) if current else None

        current_plan[sku] = current
        optimized_plan[sku] = optimized
        effective_minimums[sku] = float(effective_minimum[i])

        sku_changes.append(
            {
                "sku": sku,
                "current_production": current,
                "optimized_production": optimized,
                "absolute_change": absolute_change,
                "percentage_change": percentage_change,
                "selling_price": row["selling_price"],
                "variable_cost": row["variable_cost"],
                "contribution_margin_per_unit": row["selling_price"] - row["variable_cost"],
                "forecast_demand": row["forecast_demand"],
                "retail_minimum": row["retail_minimum"],
                "b2b_commitment": row["b2b_commitment"],
                "effective_minimum": float(effective_minimum[i]),
            }
        )

    return {
        "status": "optimal",
        "solver_status": solver_status,
        "objective": float(-result.fun) if result.fun is not None else None,
        "current_plan": current_plan,
        "optimized_plan": optimized_plan,
        "sku_changes": sku_changes,
        "current_revenue": current_revenue,
        "optimized_revenue": optimized_revenue,
        "current_variable_cost": current_variable_cost,
        "optimized_variable_cost": optimized_variable_cost,
        "current_contribution": current_contribution,
        "optimized_contribution": optimized_contribution,
        "contribution_improvement": contribution_improvement,
        "improvement_percentage": improvement_percentage,
        "current_productive_labour_minutes": current_productive_labour_minutes,
        "optimized_productive_labour_minutes": optimized_productive_labour_minutes,
        "current_contribution_per_productive_labour_hour": current_cm_per_hour,
        "optimized_contribution_per_productive_labour_hour": optimized_cm_per_hour,
        "resource_usage": resource_usage,
        "resource_availability": resource_availability,
        "resource_slack": resource_slack,
        "resource_utilization": resource_utilization,
        "binding_constraints": binding_constraints,
        "resources": resources,
        "effective_minimums": effective_minimums,
        "scenario_metadata": scenario_metadata,
    }


# ------------------------------------------------------------
# Terminal CLI — reproduces the originally-validated printed report,
# now as a thin presentation layer over optimize_production().
# ------------------------------------------------------------


def _print_report(result: dict[str, Any]) -> None:
    print()
    print("=" * 72)
    print("GRANDIOSE BAKERY - PRODUCTION MIX OPTIMIZATION")
    print("=" * 72)
    print("Illustrative / Demo Data Only")
    print()

    if result["status"] != "optimal":
        print("STATUS: NO FEASIBLE OPTIMAL PLAN FOUND")
        print()
        print("Solver message:")
        print(result["message"])
        print()
        print("-" * 72)
        print("MINIMUM RESOURCE REQUIREMENTS")
        print("-" * 72)
        for name in RESOURCE_NAMES:
            required = result["minimum_resource_requirements"][name]
            available = result["resource_availability"][name]
            shortfall = result["resource_shortfalls"][name]
            print(f"{name:<22}Required: {required:>10.2f}   Available: {available:>10.2f}   Shortfall: {shortfall:>10.2f}")
        print()
        print("=" * 72)
        return

    print("STATUS: OPTIMAL SOLUTION FOUND")
    print()
    print("-" * 72)
    print("PRODUCTION RECOMMENDATION")
    print("-" * 72)
    print(f"{'SKU':<22}{'Current':>10}{'Optimized':>12}{'Change':>10}")
    for row in result["sku_changes"]:
        print(f"{row['sku']:<22}{row['current_production']:>10}{row['optimized_production']:>12}{row['absolute_change']:>+10}")

    print()
    print("-" * 72)
    print("FINANCIAL IMPACT")
    print("-" * 72)
    print(f"Current Revenue:             AED {result['current_revenue']:,.2f}")
    print(f"Optimized Revenue:           AED {result['optimized_revenue']:,.2f}")
    print(f"Current Variable Cost:       AED {result['current_variable_cost']:,.2f}")
    print(f"Optimized Variable Cost:     AED {result['optimized_variable_cost']:,.2f}")
    print(f"Current Contribution:        AED {result['current_contribution']:,.2f}")
    print(f"Optimized Contribution:      AED {result['optimized_contribution']:,.2f}")
    print(f"Potential Improvement:       AED {result['contribution_improvement']:,.2f}")
    print(f"Improvement Percentage:      {result['improvement_percentage']:.2f}%")

    print()
    print("-" * 72)
    print("RESOURCE UTILIZATION")
    print("-" * 72)
    print(f"{'Resource':<22}{'Used':>12}{'Available':>14}{'Utilization':>14}")
    for r in result["resources"]:
        print(f"{r['name']:<22}{r['used']:>12.2f}{r['available']:>14.2f}{r['utilization_percentage']:>13.2f}%")

    print()
    print("-" * 72)
    print("RESOURCE CONSTRAINT STATUS")
    print("-" * 72)
    for r in result["resources"]:
        status = "BINDING" if r["binding"] else "AVAILABLE"
        print(f"{r['name']:<22}Slack: {r['slack']:>10.2f}   {status}")

    print()
    print("-" * 72)
    print("LABOUR PRODUCTIVITY")
    print("-" * 72)
    print(f"Current Contribution / Productive Labour Hour:   AED {result['current_contribution_per_productive_labour_hour']:,.2f}")
    print(f"Optimized Contribution / Productive Labour Hour: AED {result['optimized_contribution_per_productive_labour_hour']:,.2f}")

    print()
    print("=" * 72)


if __name__ == "__main__":
    _print_report(optimize_production(DEMO_SKU_DATA, DEMO_RESOURCE_LIMITS))
