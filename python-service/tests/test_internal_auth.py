import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
PROTECTED_ROUTES = [
    ("POST", "/recommendations/compare"),
    ("POST", "/recommendations/floors"),
    ("POST", "/floors/budget"),
    ("POST", "/materials/normalize"),
    ("POST", "/materials/captures"),
    ("GET", "/materials/status"),
]


@pytest.mark.parametrize("method,path", PROTECTED_ROUTES)
@pytest.mark.parametrize("headers", [{}, {"X-Materials-Token": "invalid-test-token-not-accepted"}])
def test_business_routes_require_internal_credential(internal_token, method, path, headers):
    response = client.request(method, path, headers=headers, json={})
    assert response.status_code == 401


@pytest.mark.parametrize("config", [None, "short", "replace-example-internal-token", "x" * 257])
def test_missing_or_invalid_configuration_fails_closed_without_disabling_health(
    monkeypatch, config
):
    if config is None:
        monkeypatch.delenv("MATERIALS_API_TOKEN", raising=False)
    else:
        monkeypatch.setenv("MATERIALS_API_TOKEN", config)
    assert client.post("/floors/budget", json={}).status_code == 503
    assert client.get("/health").status_code == 200


def test_openapi_describes_internal_header_and_leaves_health_public():
    schema = client.get("/openapi.json").json()
    scheme = schema["components"]["securitySchemes"]["InternalMaterialsToken"]
    assert scheme["in"] == "header"
    assert scheme["name"] == "X-Materials-Token"
    for method, path in PROTECTED_ROUTES:
        op = schema["paths"][path][method.lower()]
        assert op["security"] == [{"InternalMaterialsToken": []}]
        assert {"401", "503"} <= op["responses"].keys()
    assert "security" not in schema["paths"]["/health"]["get"]
