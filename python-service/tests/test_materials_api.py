import asyncio
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.api.materials import get_adapters, get_source_client, get_store
from app.capture import due_slot
from app.main import app
from app.services.capture_store import CaptureStore
from app.sources.base import SourcePage


def raw_record():
    return {
        "source": "sodimac",
        "external_id": "fixture-contract-1",
        "sku": "fixture-sku",
        "seller": "Sodimac",
        "name": "Cerámica piso de prueba 2 m2",
        "category": "ceramic",
        "currency": "CLP",
        "package_price": 10000,
        "coverage_m2": "2",
        "sale_unit": "box",
        "product_url": "https://www.sodimac.cl/sodimac-cl/articulo/fixture-contract-1/example",
    }


class FakeClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


class FakeAdapter:
    source = "sodimac"

    async def fetch_page(self, client, category, page):
        return SourcePage(
            records=[raw_record()],
            has_next=False,
            request_url="https://www.sodimac.cl/example",
            retrieved_count=1,
        )


@pytest.fixture
def api(monkeypatch, tmp_path):
    monkeypatch.setenv("MATERIALS_API_TOKEN", "unit-test-token-not-real-credentials")
    store = CaptureStore(tmp_path)
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_adapters] = lambda: {"sodimac": FakeAdapter()}
    app.dependency_overrides[get_source_client] = FakeClient
    with TestClient(app) as client:
        yield client, store
    app.dependency_overrides.clear()


def test_normalize_contract_is_pure_and_deduplicates(api):
    client, store = api
    record = raw_record()
    response = client.post(
        "/materials/normalize",
        json={
            "records": [record, record, {**record, "package_price": -1}],
            "checked_at": "2026-10-18T15:12:00Z",
        },
        headers={"X-Request-ID": "ep2-contract"},
    )
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "ep2-contract"
    body = response.json()
    assert body["duplicate_records"] == 1
    assert len(body["rejected"]) == 1
    publication = body["publications"][0]
    assert publication["price_per_box_clp"] == 10000
    assert publication["price_per_m2_clp"] == "5000.00"
    assert publication["last_checked_display"] == "18/10/2026 12:12"
    assert not store.path.exists()


@pytest.mark.parametrize("checked_at", [True, 1234567890, "2026-10-18T12:00:00"])
def test_normalize_requires_explicit_timezone(api, checked_at):
    client, _ = api
    response = client.post(
        "/materials/normalize",
        json={
            "records": [raw_record()],
            "checked_at": checked_at,
        },
    )
    assert response.status_code == 422


def test_capture_endpoint_requires_token_and_valid_configuration(api, monkeypatch):
    client, store = api
    assert client.post("/materials/captures", json={}).status_code == 401
    assert not store.path.exists()
    monkeypatch.delenv("MATERIALS_API_TOKEN")
    assert client.post("/materials/captures", json={}).status_code == 503


def test_capture_then_budget_from_normalized_real_contract(api):
    client, store = api
    headers = {
        "X-Materials-Token": "unit-test-token-not-real-credentials",
        "X-Request-ID": "integration-block1",
    }
    response = client.post(
        "/materials/captures",
        json={
            "sources": ["sodimac"],
            "categories": ["ceramic"],
        },
        headers=headers,
    )
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "complete"
    assert result["request_id"] == response.headers["X-Request-ID"]
    publication = result["publications"][0]
    fields = (
        "publication_key",
        "source",
        "price_per_box_clp",
        "coverage_per_box_m2",
        "currency",
        "checked_at",
        "availability",
        "price_type",
    )
    budget = client.post(
        "/floors/budget",
        json={
            "rooms": [
                {
                    "room_id": "living",
                    "area_m2": "10",
                    "publication": {key: publication[key] for key in fields},
                }
            ],
            "budget_clp": 50000,
        },
    )
    assert budget.status_code == 200
    assert budget.json()["rooms"][0]["boxes"] == 6
    assert budget.json()["total_cost_clp"] == 60000
    assert budget.json()["budget_excess_clp"] == 10000
    assert len(store.read()["history"][publication["publication_key"]]) == 1
    status = client.get("/materials/status", headers=headers)
    assert status.status_code == 200
    assert status.json()["publication_count"] == 1


def test_capture_lock_is_reported_as_conflict(api):
    client, store = api
    with store.locked():
        response = client.post(
            "/materials/captures",
            json={},
            headers={
                "X-Materials-Token": "unit-test-token-not-real-credentials",
            },
        )
    assert response.status_code == 409


def test_health_and_openapi_expose_new_routes_without_removing_demo(api):
    client, _ = api
    assert client.get("/health").status_code == 200
    schema = client.get("/openapi.json").json()
    for path in (
        "/recommendations/compare",
        "/floors/budget",
        "/materials/normalize",
        "/materials/captures",
        "/materials/status",
    ):
        assert path in schema["paths"]


@pytest.mark.parametrize(
    "utc_time, expected",
    [
        ("2026-10-18T11:00:00+00:00", "2026-10-18T08:00:00-03:00"),
        ("2026-10-18T15:14:00+00:00", "2026-10-18T12:00:00-03:00"),
        ("2026-10-18T15:15:00+00:00", None),
        ("2026-10-18T19:00:00+00:00", "2026-10-18T16:00:00-03:00"),
        ("2026-07-18T12:00:00+00:00", "2026-07-18T08:00:00-04:00"),
        ("2026-10-18T23:00:00+00:00", None),
    ],
)
def test_schedule_honors_chile_timezone_including_winter(utc_time, expected):
    assert due_slot(datetime.fromisoformat(utc_time)) == expected


def test_schedule_rejects_naive_dates():
    with pytest.raises(ValueError):
        due_slot(datetime(2026, 10, 18))


def test_schedule_does_not_fetch_when_no_slot_is_due(monkeypatch, tmp_path, capsys):
    from argparse import Namespace

    import app.capture as cli

    class FixedClock:
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 10, 18, 23, tzinfo=timezone.utc)

    monkeypatch.setattr(cli, "datetime", FixedClock)
    args = Namespace(data_dir=str(tmp_path), source=None, category=None, limit=10, output=None)
    assert asyncio.run(cli.run_once(args, due=True)) == 0
    assert "no_pending_slot" in capsys.readouterr().out


@pytest.mark.parametrize(
    "slot", [True, 1234567890, "2026-10-24T08:00:00", "2026-10-24T11:15:00Z"]
)
def test_http_schedule_rejects_invalid_slots(api, slot):
    client, _ = api
    response = client.post(
        "/materials/captures",
        json={"scheduled_for": slot},
        headers={"X-Materials-Token": "unit-test-token-not-real-credentials"},
    )
    assert response.status_code == 422


def test_http_schedule_records_slot_and_request_correlation(api):
    client, store = api
    response = client.post(
        "/materials/captures",
        json={
            "sources": ["sodimac"], "categories": ["ceramic"],
            "scheduled_for": "2026-10-24T11:00:00Z",
        },
        headers={
            "X-Materials-Token": "unit-test-token-not-real-credentials",
            "X-Request-ID": "nest-scheduled-fixture",
        },
    )
    assert response.status_code == 200
    assert response.json()["trigger"] == "scheduled"
    assert response.json()["scheduled_for"] == "2026-10-24T11:00:00+00:00"
    assert response.json()["request_id"] == "nest-scheduled-fixture"
    assert store.read()["slots"] == ["2026-10-24T11:00:00+00:00"]
