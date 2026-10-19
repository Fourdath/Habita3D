import asyncio
import copy
import json
from pathlib import Path

import pytest

from app.sources.base import SourceAccessError
from app.sources.sodimac import LA_FLORIDA_PID, LISTING_URL, SodimacAdapter, parse_listing


@pytest.fixture
def ceramic():
    path = Path(__file__).parent / "fixtures/sodimac_ceramic.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture
def laminate():
    path = Path(__file__).parent / "fixtures/sodimac_laminate.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_real_ceramic_separates_box_from_square_metre_and_excludes_wall(ceramic):
    page = parse_listing(ceramic, "ceramic")
    product = page.records[0]
    assert product["external_id"] == "150286806"
    assert product["package_price"] == "15.980"
    assert product["coverage_m2"] == "2"
    assert product["reported_price_m2"] == "7.990"
    assert product["sale_unit"] == "box"
    assert product["availability"] == "unknown"
    assert "?" not in product["product_url"]
    assert all("Muro" not in item["name"] for item in page.records)
    assert page.retrieved_count == 6
    assert page.excluded_count == 1
    assert page.has_next


def test_real_laminate_ignores_sponsored_spc_and_crossed_price(laminate):
    page = parse_listing(laminate, "laminate")
    assert page.retrieved_count == 6
    assert page.excluded_count == 1
    product = next(item for item in page.records if "New Ardennes" in item["name"])
    assert product["package_price"] == "19.149"
    assert product["coverage_m2"] == "2.13"
    assert product["evidence"]["classification"] == "G20041804"
    assert product["promotions"][0]["kind"] == "reference_price"
    assert product["promotions"][0]["price"] == "25.468"


@pytest.mark.parametrize("category", ["ceramic", "laminate"])
def test_third_party_sellers_are_excluded(ceramic, laminate, category):
    payload = ceramic if category == "ceramic" else laminate
    for product in payload["data"]["results"]:
        product["sellerId"] = "MARKETPLACE"
    assert parse_listing(payload, category).records == []


def test_conditioned_card_prices_do_not_become_general_prices(ceramic):
    product = ceramic["data"]["results"][0]
    card_price = copy.deepcopy(product["prices"][0])
    card_price.update(type="cmrPrice", price=["1.000"])
    product["prices"].insert(0, card_price)
    result = parse_listing(ceramic, "ceramic").records[0]
    assert result["package_price"] == "15.980"
    assert result["promotions"][0]["conditional"] is True
    assert result["promotions"][0]["price"] == "1.000"


def test_card_only_price_is_not_calculable(ceramic):
    product = ceramic["data"]["results"][0]
    product["prices"][0]["type"] = "cmrPrice"
    result = parse_listing(ceramic, "ceramic").records[0]
    assert result["package_price"] is None
    assert result["coverage_m2"] is None
    assert result["sale_unit"] == "unknown"


def test_missing_coverage_is_not_inferred_from_dimensions(ceramic):
    product = ceramic["data"]["results"][0]
    product["prices"][0]["unitPrice"].pop("quantity")
    assert parse_listing(ceramic, "ceramic").records[0]["coverage_m2"] is None


def test_explicit_out_of_stock_is_preserved(ceramic):
    ceramic["data"]["results"][0]["isOutOfStock"] = True
    assert parse_listing(ceramic, "ceramic").records[0]["availability"] == "out_of_stock"


@pytest.mark.parametrize("name", ["Piso Vinílico laminado", "Piso Flotante SPC"])
def test_out_of_scope_titles_are_excluded_even_with_floor_classification(laminate, name):
    product = laminate["data"]["results"][1]
    product["displayName"] = name
    laminate["data"]["results"] = [product]
    assert parse_listing(laminate, "laminate").records == []


def test_title_ceramic_without_floor_evidence_is_excluded(ceramic):
    product = ceramic["data"]["results"][0]
    product.pop("GSCCategoryId")
    ceramic["data"]["results"] = [product]
    assert parse_listing(ceramic, "ceramic").records == []


@pytest.mark.parametrize("payload", [{}, {"data": {}}, {"data": {"results": {}}}])
def test_upstream_schema_change_is_reported(payload):
    with pytest.raises(SourceAccessError):
        parse_listing(payload, "ceramic")


def test_empty_last_page_does_not_continue(ceramic):
    ceramic["data"].update(results=[], pagination={"count": 0, "perPage": 48, "currentPage": 1})
    result = parse_listing(ceramic, "ceramic")
    assert not result.has_next
    assert result.retrieved_count == 0


def test_wrong_page_is_reported_instead_of_duplicated(ceramic):
    with pytest.raises(SourceAccessError):
        parse_listing(ceramic, "ceramic", page=2)


@pytest.mark.parametrize("page", [0, -1, 21, True, "1"])
def test_page_number_is_bounded(ceramic, page):
    with pytest.raises(ValueError):
        parse_listing(ceramic, "ceramic", page=page)


def test_adapter_uses_fixed_location_and_source_url(ceramic):
    class Client:
        async def get_json(self, url, params=None):
            assert url == LISTING_URL
            assert params["categoryId"] == "CATG10827"
            assert params["pid"] == LA_FLORIDA_PID
            assert params["pgid"] == "95"
            assert params["page"] == 1
            return ceramic

    result = asyncio.run(SodimacAdapter().fetch_page(Client(), "ceramic", 1))
    assert "pgid=95" in result.request_url
    assert result.records
