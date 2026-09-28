from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_selects_highest_affordable_tier() -> None:
    response = client.post(
        "/recommendations/compare", json={"area_m2": 50, "budget_clp": 13_000_000}
    )

    assert response.status_code == 200
    assert response.json() == {
        "recommended_tier": "standard",
        "estimated_cost_clp": 13_000_000,
        "budget_difference_clp": 0,
        "fits_budget": True,
        "reason": (
            "La terminación standard es la opción de mayor nivel dentro del presupuesto; "
            "quedan 0 CLP. Precios demostrativos, sin disponibilidad ni cotización web."
        ),
        "source": "demo",
    }


def test_selects_premium_when_budget_allows_it() -> None:
    response = client.post(
        "/recommendations/compare", json={"area_m2": 50, "budget_clp": 20_000_000}
    )

    assert response.status_code == 200
    assert response.json()["recommended_tier"] == "premium"
    assert response.json()["estimated_cost_clp"] == 19_500_000
    assert response.json()["budget_difference_clp"] == 500_000


def test_reports_shortfall_when_even_basic_exceeds_budget() -> None:
    response = client.post(
        "/recommendations/compare", json={"area_m2": 50, "budget_clp": 8_000_000}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["recommended_tier"] == "basic"
    assert body["estimated_cost_clp"] == 9_000_000
    assert body["budget_difference_clp"] == -1_000_000
    assert body["fits_budget"] is False
    assert "Ninguna terminación" in body["reason"]
    assert body["source"] == "demo"


def test_rounds_fractional_area_to_whole_pesos() -> None:
    response = client.post(
        "/recommendations/compare", json={"area_m2": 0.000007, "budget_clp": 1}
    )

    assert response.status_code == 200
    assert response.json()["recommended_tier"] == "basic"
    assert response.json()["estimated_cost_clp"] == 1


def test_rejects_invalid_area_or_budget() -> None:
    invalid_requests = (
        {"area_m2": 0, "budget_clp": 10_000_000},
        {"area_m2": -5, "budget_clp": 10_000_000},
        {"area_m2": "50", "budget_clp": 10_000_000},
        {"area_m2": True, "budget_clp": 10_000_000},
        {"area_m2": 50, "budget_clp": 0},
        {"area_m2": 50, "budget_clp": -1},
        {"area_m2": 50, "budget_clp": 50.5},
        {"area_m2": 50, "budget_clp": True},
    )

    for request in invalid_requests:
        response = client.post("/recommendations/compare", json=request)
        assert response.status_code == 422, request


def test_rejects_missing_fields() -> None:
    response = client.post("/recommendations/compare", json={"area_m2": 50})

    assert response.status_code == 422
    assert any(error["loc"] == ["body", "budget_clp"] for error in response.json()["detail"])
