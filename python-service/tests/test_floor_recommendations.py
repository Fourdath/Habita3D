import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def api(internal_token):
    with TestClient(app, headers={"X-Materials-Token": internal_token}) as client:
        yield client


def candidate(key: str, price: int | None, **fields) -> dict:
    return {
        "publication_key": key,
        "source": "sodimac",
        "category": "ceramic",
        "currency": "CLP",
        "price_per_box_clp": price,
        "coverage_per_box_m2": "2",
        "checked_at": "2026-11-22T12:00:00-03:00",
        **fields,
    }


def payload(*candidates, **fields) -> dict:
    return {"area_m2": "7", "available_budget_clp": 80_000, "candidates": candidates, **fields}


def suggest(api, *candidates, **fields) -> dict:
    response = api.post("/recommendations/floors", json=payload(*candidates, **fields))
    assert response.status_code == 200, response.text
    return response.json()


def keys(result: dict) -> list[str]:
    return [item["publication_key"] for item in result["items"]]


def test_prefers_category_then_store_then_cost_and_limits_affordable_results(api):
    offers = (
        candidate("más-barato-otro-tipo", 12_000, category="laminate", source="easy"),
        candidate("segunda-tienda", 13_000),
        candidate("caro-primera-tienda", 19_000, source="easy"),
        candidate("barato-primera-tienda", 18_000, source="easy"),
        candidate("fuera-presupuesto", 23_000, source="easy"),
    )
    result = suggest(api, *offers, preferred_category="ceramic", preferred_source="easy")
    assert result["status"] == "within_budget"
    assert result["rule_version"] == "floor-rules-v1"
    assert keys(result) == [
        "barato-primera-tienda", "caro-primera-tienda", "segunda-tienda"
    ]
    item = result["items"][0]
    assert item["boxes"] == 4
    assert item["cost_clp"] == 72_000
    assert item["budget_excess_clp"] == 0
    assert any("tipo de piso" in reason for reason in item["reasons"])
    assert any("tienda" in reason for reason in item["reasons"])
    changed = suggest(api, *offers, preferred_category="laminate", preferred_source="easy")
    assert keys(changed)[0] == "más-barato-otro-tipo"


def test_equal_estimates_keep_a_deterministic_order_with_no_preferences(api):
    offers = (candidate("z", 15_000), candidate("a", 15_000), candidate("b", 14_000))
    assert keys(suggest(api, *offers)) == ["b", "a", "z"]
    assert keys(suggest(api, *reversed(offers))) == ["b", "a", "z"]


def test_when_no_floor_fits_sort_only_by_excess_even_with_preferences(api):
    result = suggest(
        api,
        candidate("con-preferencia", 25_000, source="easy"),
        candidate("menor-exceso", 23_000, category="laminate"),
        preferred_category="ceramic",
        preferred_source="easy",
    )
    assert result["status"] == "over_budget"
    assert keys(result) == ["menor-exceso", "con-preferencia"]
    assert result["items"][0]["budget_excess_clp"] == 12_000
    assert "12000 CLP" in result["items"][0]["reasons"][0]


@pytest.mark.parametrize("budget, excess", [(0, 36_000), (-4_000, 40_000)])
def test_zero_and_negative_remaining_balance_are_not_clamped(api, budget, excess):
    result = suggest(api, candidate("a", 9_000), available_budget_clp=budget)
    assert result["status"] == "over_budget"
    assert result["items"][0]["budget_excess_clp"] == excess


def test_unknown_stock_is_valid_and_excludes_sold_out_and_uncalculable_offers(api):
    unusable = (
        candidate("agotado", 1, availability="unavailable"),
        candidate("sin-precio", None),
        candidate("sin-cobertura", 100, coverage_per_box_m2=None),
    )
    result = suggest(api, *unusable, candidate("sin-confirmar", 20_000))
    assert result["status"] == "within_budget"
    assert keys(result) == ["sin-confirmar"]
    assert suggest(api, *unusable)["status"] == "no_candidates"
    assert suggest(api)["items"] == []


def test_dimensions_and_waste_use_exact_box_arithmetic(api):
    offer = candidate("a", 1, coverage_per_box_m2="0.1")
    params = {"area_m2": None, "length_m": "0.3", "width_m": "1"}
    assert suggest(api, offer, **params, waste_percent=0)["items"][0]["boxes"] == 3
    assert suggest(api, offer, **params, waste_percent=1)["items"][0]["boxes"] == 4


@pytest.mark.parametrize("fields", [
    {"area_m2": True},
    {"area_m2": "NaN"},
    {"area_m2": 0},
    {"area_m2": None, "length_m": 1},
    {"length_m": 1, "width_m": 1},
    {"waste_percent": 101},
    {"available_budget_clp": True},
    {"available_budget_clp": 10**16},
    {"preferred_category": "vinyl"},
    {"preferred_source": "unknown"},
    {"unsupported": "value"},
])
def test_invalid_request_fields_are_rejected(api, fields):
    assert api.post("/recommendations/floors", json=payload(**fields)).status_code == 422


def test_invalid_duplicates_and_oversized_batches_are_rejected(api):
    path = "/recommendations/floors"
    offer = candidate("a", 9_000)
    assert api.post(path, json=payload(offer, offer)).status_code == 422
    naive_date = candidate("b", 9, checked_at="2026-11-22")
    assert api.post(path, json=payload(naive_date)).status_code == 422
    too_many = [candidate(str(index), 1) for index in range(41)]
    assert api.post(path, json=payload(*too_many)).status_code == 422


def test_never_returns_costs_outside_the_shared_integer_range(api):
    extreme = candidate("a", 1_000_000_000, coverage_per_box_m2="0.000001")
    response = api.post("/recommendations/floors", json=payload(extreme, area_m2="1000000"))
    assert response.status_code == 422
    assert "rango admitido" in response.json()["detail"]
