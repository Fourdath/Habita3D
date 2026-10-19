import json

import pytest
from fastapi.testclient import TestClient

from app.api.materials import get_store
from app.main import app
from app.services.capture_store import CaptureStore


def raw_record(**changes):
    return {
        "source": "sodimac",
        "external_id": "defensive-test",
        "sku": "defensive-sku",
        "seller": "Sodimac",
        "name": "Cerámica piso",
        "category": "ceramic",
        "currency": "CLP",
        "package_price": 10000,
        "coverage_m2": "2",
        "sale_unit": "box",
        "product_url": "https://www.sodimac.cl/sodimac-cl/articulo/defensive-test/piso",
        **changes,
    }


@pytest.fixture
def api(monkeypatch, tmp_path):
    monkeypatch.setenv("MATERIALS_API_TOKEN", "defensive-test-token-not-real-credentials")
    store = CaptureStore(tmp_path)
    app.dependency_overrides[get_store] = lambda: store
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client, store
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "coverage",
    ["1e-100", "0.0000001", "1000.000001", True, False, "9" * 81, "Infinity", "NaN"],
)
def test_extreme_or_boolean_coverage_is_rejected_as_data_instead_of_crashing(api, coverage):
    client, store = api
    response = client.post(
        "/materials/normalize",
        json={
            "records": [raw_record(coverage_m2=coverage)],
            "checked_at": "2026-10-18T15:00:00Z",
        },
    )
    assert response.status_code == 200
    assert response.json()["publications"] == []
    assert len(response.json()["rejected"]) == 1
    assert not store.path.exists()


def test_rejected_extreme_record_does_not_prevent_a_valid_sibling_record(api):
    client, _ = api
    response = client.post(
        "/materials/normalize",
        json={
            "records": [raw_record(coverage_m2="1e-100"), raw_record()],
            "checked_at": "2026-10-18T15:00:00Z",
        },
    )
    assert response.status_code == 200
    assert len(response.json()["publications"]) == 1
    assert len(response.json()["rejected"]) == 1


@pytest.mark.parametrize("coverage", ["0.000001", "2.0000000", "1000"])
def test_valid_precision_and_equivalent_trailing_zeroes_remain_accepted(api, coverage):
    client, _ = api
    response = client.post(
        "/materials/normalize",
        json={
            "records": [raw_record(coverage_m2=coverage)],
            "checked_at": "2026-10-18T15:00:00Z",
        },
    )
    assert response.status_code == 200
    assert len(response.json()["publications"]) == 1
    assert response.json()["rejected"] == []


@pytest.mark.parametrize("token", [b"\xe9", b"invalid-token", b"true"])
def test_malformed_non_ascii_or_invalid_capture_token_returns_401(api, token):
    client, store = api
    response = client.post(
        "/materials/captures", json={}, headers=[(b"X-Materials-Token", token)]
    )
    assert response.status_code == 401
    assert not store.path.exists()


def empty_state():
    return {"version": 1, "publications": {}, "history": {}, "slots": [], "runs": []}


@pytest.mark.parametrize(
    "state",
    [
        [],
        {},
        {"version": 1},
        {**empty_state(), "version": True},
        {**empty_state(), "publications": []},
        {**empty_state(), "history": []},
        {**empty_state(), "slots": {}},
        {**empty_state(), "runs": {}},
        {**empty_state(), "last_capture": []},
        {**empty_state(), "last_capture": {}},
    ],
)
def test_corrupt_cache_shape_is_reported_without_resetting_original_evidence(api, state):
    client, store = api
    original = json.dumps(state).encode()
    store.path.write_bytes(original)
    with pytest.raises(ValueError):
        store.read()
    response = client.get(
        "/materials/status",
        headers={"X-Materials-Token": "defensive-test-token-not-real-credentials"},
    )
    assert response.status_code == 503
    assert store.path.read_bytes() == original
    assert list(store.directory.iterdir()) == [store.path]
