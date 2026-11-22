from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app

PATH = "/recommendations/floors"
TOKEN = "floor-recommendation-test-token-nonsecret"
client = TestClient(app)


@pytest.fixture(autouse=True)
def configured_token(monkeypatch) -> None:
    monkeypatch.setenv("MATERIALS_API_TOKEN", TOKEN)


def publication(key: str, price: int | None, **changes) -> dict:
    return {
        "publication_key": key,
        "name": f"Piso {key}",
        "category": "ceramic",
        "source": "sodimac",
        "price_per_box_clp": price,
        "coverage_per_box_m2": "1",
        "currency": "CLP",
        "price_type": "public",
        "checked_at": (datetime.now(UTC) - timedelta(hours=3)).isoformat(),
        "availability": "available",
        **changes,
    }


def request_data(*publications: dict, **changes) -> dict:
    return {
        "budget_clp": 80000,
        "room": {"room_id": "living", "area_m2": "10", "waste_percent": "0"},
        "publications": publications,
        **changes,
    }


def post(*publications: dict, **changes):
    return client.post(
        PATH,
        json=request_data(*publications, **changes),
        headers={"X-Materials-Token": TOKEN},
    )


def test_ranks_affordable_candidates_by_category_store_then_cost() -> None:
    data = request_data(
        publication("laminate-cheapest", 1000, category="laminate"),
        publication("ceramic-easy", 6000, source="easy"),
        publication("ceramic-sodimac-2", 8000),
        publication("ceramic-sodimac-1", 7500),
        publication("too-expensive", 9200),
    )
    data["room"].update(preferred_category="ceramic", preferred_source="sodimac")
    response = client.post(PATH, json=data, headers={"X-Materials-Token": TOKEN})
    assert response.status_code == 200
    result = response.json()
    assert result["available_budget_clp"] == 80000
    assert result["empty_reason"] is None
    assert result["provisional_budget"] is False
    assert [row["publication_key"] for row in result["suggestions"]] == [
        "ceramic-sodimac-1",
        "ceramic-sodimac-2",
        "ceramic-easy",
    ]
    assert result["suggestions"][0] == {
        "publication_key": "ceramic-sodimac-1",
        "boxes": 10,
        "total_clp": 75000,
        "fits_budget": True,
        "budget_excess_clp": 0,
        "price_stale": False,
        "reasons": [
            "Cabe en el presupuesto disponible",
            "Coincide con el tipo de piso preferido",
            "Coincide con la tienda preferida",
        ],
    }
    data["room"]["preferred_category"] = "laminate"
    changed = client.post(PATH, json=data, headers={"X-Materials-Token": TOKEN}).json()
    assert changed["suggestions"][0]["publication_key"] == "laminate-cheapest"


def test_uses_project_remaining_and_marks_other_rooms_without_a_cost_as_provisional() -> None:
    committed = publication("selected", 10000, coverage_per_box_m2="2")
    committed.pop("category")
    committed.pop("name")
    known_room = {
        "room_id": "bedroom",
        "length_m": "2.5",
        "width_m": "4",
        "waste_percent": 0,
        "publication": committed,
    }
    unpriced_room = {"room_id": "bathroom", "area_m2": "4", "publication": None}
    room = {"room_id": "living", "area_m2": "10", "waste_percent": 0, "budget_clp": 100000}
    result = post(
        publication("floor", 9200),
        budget_clp=130000,
        room=room,
        other_rooms=[known_room, unpriced_room],
    ).json()
    assert result["available_budget_clp"] == 80000
    assert result["provisional_budget"] is True
    assert result["suggestions"][0]["budget_excess_clp"] == 12000
    assert result["suggestions"][0]["fits_budget"] is False
    room["budget_clp"] = 70000
    result = post(publication("floor", 9200), budget_clp=130000, room=room).json()
    assert result["available_budget_clp"] == 70000
    result = post(publication("floor", 9200), budget_clp=10000, other_rooms=[known_room]).json()
    assert result["available_budget_clp"] == 0


def test_orders_excess_by_amount_skips_unavailable_and_identifies_stale_price() -> None:
    stale_at = (datetime.now(UTC) - timedelta(hours=25)).isoformat()
    result = post(
        publication("more", 10000),
        publication("less", 9200, availability="unknown", checked_at=stale_at),
        publication("out", 3000, availability="unavailable"),
        publication("no-coverage", 1500, coverage_per_box_m2=None),
        publication("no-price", None),
    ).json()
    assert [row["publication_key"] for row in result["suggestions"]] == ["less", "more"]
    assert result["suggestions"][0]["budget_excess_clp"] == 12000
    assert result["suggestions"][0]["price_stale"] is True
    assert result["suggestions"][1]["price_stale"] is False


def test_excludes_room_dismissals_and_reprices_independent_of_selected_rank() -> None:
    options = (publication("first", 6000), publication("second", 9200))
    result = post(*options, exclude=["first"]).json()
    assert result["suggestions"][0]["publication_key"] == "second"
    assert post(*options, exclude=["first", "second"]).json()["empty_reason"] == "all_dismissed"
    assert (
        post(publication("out", 1, availability="unavailable")).json()["empty_reason"]
        == "no_calculable_options"
    )
    accepted = post(*options, selected_publication_key="second", exclude=["second"]).json()
    assert [row["publication_key"] for row in accepted["suggestions"]] == ["second"]
    assert accepted["suggestions"][0]["total_clp"] == 92000


def test_design_exposes_authentication_and_rejects_invalid_context(monkeypatch) -> None:
    data = request_data(publication("one", 12000))
    assert client.post(PATH, json=data).status_code == 401
    assert client.post(PATH, json=data, headers={"X-Materials-Token": "invalid"}).status_code == 401
    schema = client.get("/openapi.json").json()
    assert schema["paths"][PATH]["post"]["security"] == [{"MaterialsToken": []}]
    assert schema["paths"]["/floors/budget"]["post"]["security"] == [{"MaterialsToken": []}]
    assert post(publication("one", 10000), publication("one", 12000)).status_code == 422
    assert (
        post(
            publication("one", 12000),
            other_rooms=[{"room_id": "living", "area_m2": "8"}],
        ).status_code
        == 422
    )
    assert post(publication("one", 12000), exclude=["a"] * 41).status_code == 422
    monkeypatch.delenv("MATERIALS_API_TOKEN")
    assert post(publication("one", 12000)).status_code == 503
