import asyncio
import copy
import json
from pathlib import Path
from urllib.parse import unquote

import pytest

from app.sources.base import SourceAccessError
from app.sources.easy import EasyAdapter, extract_next_data, parse_listing

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(category="ceramic"):
    return json.loads((FIXTURES / f"easy_{category}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("category", ["ceramic", "laminate"])
def test_real_public_samples_are_parsed_with_provenance(category):
    result = parse_listing(fixture(category), category, 1, "https://www.easy.cl/search/example")
    assert result.records
    assert result.retrieved_count == 10
    assert result.excluded_count == 10 - len(result.records)
    assert result.has_next
    for item in result.records:
        assert item["source"] == "easy"
        assert item["category"] == category
        assert item["seller"] == "Easy"
        assert item["sale_unit"] == "box"
        assert item["coverage_m2"]
        assert item["availability"] == "unknown"
        assert item["product_url"].startswith("https://www.easy.cl/")
        assert item["evidence"]["requested_commune_code"] == "13110"


def test_general_offer_is_separate_from_coupon_and_brand_price():
    payload = fixture()
    product = payload["pageProps"]["serverProductsResponse"]["productList"][0]
    product["prices"]["brandPrice"] = 100
    result = parse_listing(payload, "ceramic", 1, "https://www.easy.cl/")
    first = result.records[0]
    assert first["package_price"] == 12243
    assert first["reported_price_m2"] == 5490
    assert first["coverage_m2"] == "2,23"
    assert any(p["type"] == "conditional_ribbon" for p in first["promotions"])
    assert any(p["type"] == "brand_price" for p in first["promotions"])


def test_card_only_offer_is_not_the_unconditional_price():
    payload = fixture()
    product = payload["pageProps"]["serverProductsResponse"]["productList"][0]
    product["commercialOffer"]["defaultOffer"]["cardPromotions"] = [
        {"type": "card", "id": "CENCOSUD", "name": "Solo tarjeta"}
    ]
    result = parse_listing(payload, "ceramic", 1, "https://www.easy.cl/")
    assert result.records[0]["package_price"] == 19156


def test_marketplace_wall_only_and_vinyl_records_are_excluded():
    payload = fixture()
    template = payload["pageProps"]["serverProductsResponse"]["productList"][0]
    records = []
    for changes in [
        {"isMarketplace": True},
        {"sellerName": "Vendedor externo"},
        {"isMarketplace": None},
        {"productName": "Cerámica muro 2 m2", "specifications": []},
        {"productName": "Piso vinílico SPC 2 m2"},
    ]:
        item = copy.deepcopy(template)
        item.update(changes)
        records.append(item)
    payload["pageProps"]["serverProductsResponse"]["productList"] = records
    result = parse_listing(payload, "ceramic", 1, "https://www.easy.cl/")
    assert result.records == []
    assert result.retrieved_count == result.excluded_count == 5


def test_query_does_not_decide_category_or_coverage():
    payload = fixture("laminate")
    product = payload["pageProps"]["serverProductsResponse"]["productList"][0]
    product["productName"] = "Limpiador para pisos flotantes 1 litro"
    product["categories"] = ["Limpieza"]
    payload["pageProps"]["serverProductsResponse"]["productList"] = [product]
    assert not parse_listing(payload, "laminate", 1, "https://www.easy.cl/").records


def test_missing_box_coverage_is_not_calculated_from_prices():
    payload = fixture()
    product = payload["pageProps"]["serverProductsResponse"]["productList"][0]
    product["productName"] = "Cerámica piso Mississippi"
    result = parse_listing(payload, "ceramic", 1, "https://www.easy.cl/")
    assert result.records[0]["coverage_m2"] is None


def test_next_data_supports_html_and_rejects_changed_schema():
    payload = fixture()
    html_payload = {"props": payload, "buildId": "any-new-deployment"}
    html = (
        '<html><script id="__NEXT_DATA__" type="application/json">'
        f'{json.dumps(html_payload)}</script>'
    )
    parsed = extract_next_data(html)
    assert parse_listing(parsed, "ceramic", 1, "https://www.easy.cl/").records
    with pytest.raises(SourceAccessError):
        extract_next_data("<html>Captcha or changed page</html>")
    with pytest.raises(SourceAccessError):
        parse_listing({"pageProps": {}}, "ceramic", 1, "https://www.easy.cl/")


def test_fetch_uses_only_public_location_and_normal_html_pagination():
    class Client:
        def __init__(self):
            self.calls = []

        async def get_text(self, url, params=None, cookies=None):
            self.calls.append((url, params, cookies))
            payload = {"props": fixture(), "buildId": "deployment-can-change"}
            return f'<script id="__NEXT_DATA__">{json.dumps(payload)}</script>'

    client = Client()
    adapter = EasyAdapter(sellers=["502", "503"])
    result = asyncio.run(adapter.fetch_page(client, "ceramic", 2))
    url, params, cookies = client.calls[0]
    assert url == "https://www.easy.cl/search/ceramica%20piso"
    assert params == {"page": 2}
    assert set(cookies) == {
        "X-Constructor-Region",
        "X-Constructor-Commune-Code",
        "X-Constructor-Sellers",
    }
    assert cookies["X-Constructor-Commune-Code"] == "13110"
    assert unquote(cookies["X-Constructor-Sellers"]) == "502,503"
    assert result.warnings


def test_seller_override_and_unsupported_category(monkeypatch):
    monkeypatch.setenv("EASY_SELLER_IDS", "502, 503")
    assert EasyAdapter()._sellers == ["502", "503"]
    with pytest.raises(ValueError):
        asyncio.run(EasyAdapter().fetch_page(object(), "arbitrary-url", 1))


def test_last_short_page_stops_without_fetching_more_pages():
    payload = fixture()
    listing = payload["pageProps"]["serverProductsResponse"]
    listing["recordsFiltered"] = 83
    listing["productList"] = listing["productList"][:3]
    assert not parse_listing(payload, "ceramic", 3, "https://www.easy.cl/").has_next
