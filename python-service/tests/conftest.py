import pytest


@pytest.fixture
def internal_token(monkeypatch) -> str:
    token = "unit-test-token-not-real-credentials"
    monkeypatch.setenv("MATERIALS_API_TOKEN", token)
    return token
