from copy import deepcopy
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.floors import router
from app.services.floor_budget import calculate_floor

app = FastAPI()
app.include_router(router)
client = TestClient(app)


def room(**changes: object) -> dict:
    result = {
        "room_id": "living",
        "area_m2": "20",
        "publication": {
            "publication_key": "sodimac:floor-1",
            "source": "sodimac",
            "price_per_box_clp": 15980,
            "coverage_per_box_m2": "2",
            "currency": "CLP",
            "checked_at": "2026-10-18T12:15:00Z",
        },
    }
    result.update(changes)
    return result


def post(*rooms: dict, **changes: object):
    return client.post("/floors/budget", json={"rooms": list(rooms), **changes})


def test_default_waste_complete_boxes_and_santiago_check_time() -> None:
    response = post(room(), budget_clp=180000)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "complete"
    assert data["total_cost_clp"] == data["calculable_subtotal_clp"] == 175780
    assert data["budget_difference_clp"] == 4220
    assert data["budget_excess_clp"] == 0
    assert data["fits_budget"] is True
    result = data["rooms"][0]
    assert result["boxes"] == 11
    assert Decimal(result["required_area_m2"]) == Decimal(22)
    assert result["last_check_display"] == "18/10/2026 09:15"
    assert result["availability"] == "unknown"
    assert data["scope"] == "floor_boxes_only"


@pytest.mark.parametrize("waste,boxes", [(0, 10), (10, 11), (100, 20)])
def test_zero_default_and_maximum_waste(waste: int, boxes: int) -> None:
    response = post(room(waste_percent=waste))
    assert response.status_code == 200
    assert response.json()["rooms"][0]["boxes"] == boxes


def test_exact_box_boundary_does_not_round_up_but_small_excess_does() -> None:
    first = room(area_m2="0.3", waste_percent=0)
    first["publication"]["coverage_per_box_m2"] = "0.1"
    exact = post(first).json()["rooms"][0]
    assert exact["boxes"] == 3
    first["area_m2"] = "0.300001"
    excess = post(first).json()["rooms"][0]
    assert excess["boxes"] == 4


def test_length_width_and_multiple_room_budget_limits() -> None:
    first = room(area_m2=None, length_m="4.2", width_m="3", budget_clp=100000)
    second = room(room_id="bedroom", area_m2="10", waste_percent=0, budget_clp=100000)
    data = post(first, second, budget_clp=150000).json()
    assert Decimal(data["rooms"][0]["area_m2"]) == Decimal("12.6")
    assert data["rooms"][0]["boxes"] == 7
    assert data["rooms"][0]["cost_clp"] == 111860
    assert data["rooms"][0]["budget_excess_clp"] == 11860
    assert data["rooms"][0]["fits_budget"] is False
    assert data["rooms"][1]["cost_clp"] == 79900
    assert data["rooms"][1]["budget_difference_clp"] == 20100
    assert data["total_cost_clp"] == 191760
    assert data["budget_difference_clp"] == -41760
    assert data["budget_excess_clp"] == 41760
    assert data["fits_budget"] is False


def test_missing_coverage_and_price_are_explicitly_uncalculable() -> None:
    missing = room(room_id="bedroom", budget_clp=0)
    missing["publication"].pop("price_per_box_clp")
    missing["publication"].pop("coverage_per_box_m2")
    data = post(room(), missing, budget_clp=1000000).json()
    assert data["status"] == "partial"
    assert data["calculated_rooms"] == data["uncalculable_rooms"] == 1
    assert data["calculable_subtotal_clp"] == 175780
    assert data["total_cost_clp"] is None
    assert data["fits_budget"] is None
    assert data["budget_difference_clp"] is None
    result = data["rooms"][1]
    assert result["status"] == "uncalculable"
    assert result["reasons"] == ["missing_price", "missing_coverage"]
    assert result["cost_clp"] is None
    assert result["boxes"] is None
    assert result["fits_budget"] is None
    all_missing = post(missing).json()
    assert all_missing["status"] == "uncalculable"
    assert all_missing["total_cost_clp"] is None
    assert all_missing["calculable_subtotal_clp"] == 0


def test_known_unavailable_item_keeps_cost_and_explicit_availability() -> None:
    selected = room()
    selected["publication"]["availability"] = "unavailable"
    data = post(selected, budget_clp=0).json()
    assert data["rooms"][0]["availability"] == "unavailable"
    assert data["total_cost_clp"] == 175780
    assert data["budget_excess_clp"] == 175780


@pytest.mark.parametrize("field", ["area_m2", "length_m", "width_m", "waste_percent"])
@pytest.mark.parametrize("value", [True, False, "NaN", "Infinity", "-Infinity", {}, []])
def test_invalid_decimal_fields_return_422(field: str, value: object) -> None:
    selected = room() if field in {"area_m2", "waste_percent"} else room(
        area_m2=None, length_m=2, width_m=3
    )
    selected[field] = value
    assert post(selected).status_code == 422


@pytest.mark.parametrize("changes", [
    {"area_m2": 0},
    {"area_m2": -1},
    {"area_m2": "0.0000001"},
    {"area_m2": 10, "length_m": 2, "width_m": 5},
    {"area_m2": None},
    {"area_m2": None, "length_m": 2},
    {"waste_percent": -1},
    {"waste_percent": 101},
    {"waste_percent": None},
    {"room_id": " "},
    {"budget_clp": True},
    {"budget_clp": -1},
    {"budget_clp": 1.5},
    {"unknown": "extra"},
])
def test_invalid_room_requests(changes: dict) -> None:
    assert post(room(**changes)).status_code == 422


@pytest.mark.parametrize("field,value", [
    ("coverage_per_box_m2", 0),
    ("coverage_per_box_m2", True),
    ("coverage_per_box_m2", "NaN"),
    ("price_per_box_clp", 0),
    ("price_per_box_clp", -1),
    ("price_per_box_clp", True),
    ("price_per_box_clp", "15980"),
    ("price_per_box_clp", 15980.5),
    ("currency", "USD"),
    ("price_type", "credit_card"),
    ("price_type", "loyalty"),
    ("source", "demo"),
    ("availability", "inferred"),
    ("checked_at", "2026-10-18T12:00:00"),
    ("checked_at", True),
    ("checked_at", 1780000000),
    ("publication_key", " "),
    ("unknown", 1),
])
def test_invalid_snapshots(field: str, value: object) -> None:
    selected = room()
    selected["publication"][field] = value
    assert post(selected).status_code == 422


def test_request_room_count_identifiers_and_extra_fields() -> None:
    assert post().status_code == 422
    assert post(room(), deepcopy(room())).status_code == 422
    assert post(*(room(room_id=str(index)) for index in range(101))).status_code == 422
    assert post(room(), extra=True).status_code == 422
    assert post(room(), budget_clp=True).status_code == 422


def test_exact_decimal_calculation_service() -> None:
    estimate = calculate_floor(
        area_m2=Decimal("0.1"),
        waste_percent=Decimal("10"),
        coverage_per_box_m2=Decimal("0.01"),
        price_per_box_clp=1,
    )
    assert estimate.boxes == 11
    assert estimate.cost_clp == 11
    assert estimate.required_area_m2 == Decimal("0.11")
