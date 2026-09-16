import copy
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from optimization_engine import (  # noqa: E402
    DEMO_RESOURCE_LIMITS,
    DEMO_SKU_DATA,
    OptimizationInputError,
    optimize_production,
)


def approx(value, expected, tol=0.01):
    return math.isclose(value, expected, abs_tol=tol)


def plan_for(result, sku):
    return next(row for row in result["sku_changes"] if row["sku"] == sku)


class TestBaselineOptimization:
    """TEST 1 — baseline optimization reproduces the validated result."""

    def test_baseline_matches_validated_result(self):
        result = optimize_production(DEMO_SKU_DATA, DEMO_RESOURCE_LIMITS)

        assert result["status"] == "optimal"

        expected_optimized = {
            "Croissant": 1200,
            "Pain au Chocolat": 400,
            "Danish": 350,
            "Brioche": 490,
            "Cinnamon Roll": 725,
        }
        assert result["optimized_plan"] == expected_optimized

        assert approx(result["current_revenue"], 26325.00)
        assert approx(result["optimized_revenue"], 26292.50)
        assert approx(result["current_variable_cost"], 10985.00)
        assert approx(result["optimized_variable_cost"], 10856.00)
        assert approx(result["current_contribution"], 15340.00)
        assert approx(result["optimized_contribution"], 15436.50)
        assert approx(result["contribution_improvement"], 96.50)
        assert approx(result["improvement_percentage"], 0.63, tol=0.05)

        assert approx(result["resource_usage"]["labour_minutes"], 9945)
        assert approx(result["resource_slack"]["labour_minutes"], 40)
        assert not result["resources"][RESOURCE_INDEX["labour_minutes"]]["binding"]

        for name in ("oven_minutes", "flour_kg", "butter_kg"):
            assert name in result["binding_constraints"]

        assert approx(result["current_contribution_per_productive_labour_hour"], 92.18, tol=0.05)
        assert approx(result["optimized_contribution_per_productive_labour_hour"], 93.13, tol=0.05)

    def test_baseline_inputs_are_not_mutated(self):
        skus_before = copy.deepcopy(DEMO_SKU_DATA)
        resources_before = copy.deepcopy(DEMO_RESOURCE_LIMITS)

        optimize_production(DEMO_SKU_DATA, DEMO_RESOURCE_LIMITS, scenario={"resource_overrides": {"flour_kg": 1.0}})

        assert DEMO_SKU_DATA == skus_before
        assert DEMO_RESOURCE_LIMITS == resources_before


RESOURCE_INDEX = {"labour_minutes": 0, "oven_minutes": 1, "flour_kg": 2, "butter_kg": 3}


class TestResourceShortageScenarios:
    """TEST 2 / TEST 3 — flour and butter shortages re-optimize feasibly."""

    def test_flour_shortage_10_percent(self):
        result = optimize_production(
            DEMO_SKU_DATA,
            DEMO_RESOURCE_LIMITS,
            scenario={"name": "Flour -10%", "resource_overrides": {"flour_kg": 230.625}},
        )
        assert result["status"] == "optimal"
        assert result["resource_usage"]["flour_kg"] <= 230.625 + 1e-6
        assert result["resource_availability"]["flour_kg"] == pytest.approx(230.625)

    def test_butter_shortage_10_percent(self):
        result = optimize_production(
            DEMO_SKU_DATA,
            DEMO_RESOURCE_LIMITS,
            scenario={"name": "Butter -10%", "resource_overrides": {"butter_kg": 84.24}},
        )
        assert result["status"] == "optimal"
        assert result["resource_usage"]["butter_kg"] <= 84.24 + 1e-6
        assert result["resource_availability"]["butter_kg"] == pytest.approx(84.24)


class TestB2BCommitmentScenario:
    """TEST 4 — a raised B2B commitment is respected as a hard minimum."""

    def test_danish_b2b_commitment_increase(self):
        result = optimize_production(
            DEMO_SKU_DATA,
            DEMO_RESOURCE_LIMITS,
            scenario={"name": "Danish B2B +150", "sku_overrides": {"Danish": {"b2b_commitment": 500}}},
        )
        assert result["status"] == "optimal"
        danish = plan_for(result, "Danish")
        assert danish["optimized_production"] >= 500
        assert danish["effective_minimum"] == 500


class TestInfeasibility:
    """TEST 5 — infeasibility is reported as structured data, not a crash."""

    def test_severe_butter_shortage_is_infeasible(self):
        result = optimize_production(
            DEMO_SKU_DATA,
            DEMO_RESOURCE_LIMITS,
            scenario={"name": "Severe butter shortage", "resource_overrides": {"butter_kg": 56.16}},
        )
        assert result["status"] == "infeasible"
        assert "message" in result
        assert approx(result["resource_shortfalls"]["butter_kg"], 0.69, tol=0.02)
        assert result["minimum_resource_requirements"]["butter_kg"] == pytest.approx(
            result["resource_availability"]["butter_kg"] + result["resource_shortfalls"]["butter_kg"], abs=0.02
        )


class TestScenarioIsolation:
    def test_scenario_does_not_leak_into_next_call(self):
        scenario_result = optimize_production(
            DEMO_SKU_DATA,
            DEMO_RESOURCE_LIMITS,
            scenario={"resource_overrides": {"flour_kg": 230.625}},
        )
        baseline_result = optimize_production(DEMO_SKU_DATA, DEMO_RESOURCE_LIMITS)

        assert scenario_result["resource_availability"]["flour_kg"] == pytest.approx(230.625)
        assert baseline_result["resource_availability"]["flour_kg"] == pytest.approx(256.25)

    def test_global_sku_multiplier_scenario(self):
        result = optimize_production(
            DEMO_SKU_DATA,
            DEMO_RESOURCE_LIMITS,
            scenario={"name": "Demand +10%", "global_sku_multipliers": {"forecast_demand": 1.10}},
        )
        assert result["status"] in ("optimal", "infeasible")
        croissant_demand = next(r for r in DEMO_SKU_DATA if r["sku"] == "Croissant")["forecast_demand"]
        assert result["scenario_metadata"]["global_sku_multipliers"] == {"forecast_demand": 1.10}
        if result["status"] == "optimal":
            croissant = plan_for(result, "Croissant")
            assert croissant["forecast_demand"] == pytest.approx(croissant_demand * 1.10)


class TestInputValidation:
    def test_empty_sku_data_rejected(self):
        with pytest.raises(OptimizationInputError):
            optimize_production([], DEMO_RESOURCE_LIMITS)

    def test_missing_required_field_rejected(self):
        bad_skus = copy.deepcopy(DEMO_SKU_DATA)
        del bad_skus[0]["selling_price"]
        with pytest.raises(OptimizationInputError):
            optimize_production(bad_skus, DEMO_RESOURCE_LIMITS)

    def test_negative_selling_price_rejected(self):
        bad_skus = copy.deepcopy(DEMO_SKU_DATA)
        bad_skus[0]["selling_price"] = -1
        with pytest.raises(OptimizationInputError):
            optimize_production(bad_skus, DEMO_RESOURCE_LIMITS)

    def test_negative_variable_cost_rejected(self):
        bad_skus = copy.deepcopy(DEMO_SKU_DATA)
        bad_skus[0]["variable_cost"] = -1
        with pytest.raises(OptimizationInputError):
            optimize_production(bad_skus, DEMO_RESOURCE_LIMITS)

    def test_negative_resource_availability_rejected(self):
        bad_resources = copy.deepcopy(DEMO_RESOURCE_LIMITS)
        bad_resources["flour_kg"] = -5
        with pytest.raises(OptimizationInputError):
            optimize_production(DEMO_SKU_DATA, bad_resources)

    def test_effective_minimum_exceeding_demand_rejected(self):
        bad_skus = copy.deepcopy(DEMO_SKU_DATA)
        bad_skus[0]["b2b_commitment"] = bad_skus[0]["forecast_demand"] + 1
        with pytest.raises(OptimizationInputError):
            optimize_production(bad_skus, DEMO_RESOURCE_LIMITS)

    def test_duplicate_sku_identifier_rejected(self):
        bad_skus = copy.deepcopy(DEMO_SKU_DATA)
        bad_skus.append(copy.deepcopy(bad_skus[0]))
        with pytest.raises(OptimizationInputError):
            optimize_production(bad_skus, DEMO_RESOURCE_LIMITS)

    def test_missing_resource_key_rejected(self):
        bad_resources = copy.deepcopy(DEMO_RESOURCE_LIMITS)
        del bad_resources["oven_minutes"]
        with pytest.raises(OptimizationInputError):
            optimize_production(DEMO_SKU_DATA, bad_resources)
