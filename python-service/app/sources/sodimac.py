"""Public Sodimac listing adapter; prices are observations, not purchase quotations."""

import unicodedata
from typing import Any
from urllib.parse import urlencode, urlsplit, urlunsplit

from app.sources.base import SourceAccessError, SourcePage

LISTING_URL = "https://www.sodimac.cl/s/browse/v1/listing/cl"
LA_FLORIDA_PID = "4107aaf9-b3f4-4666-b8d5-bea868c34751"
CATEGORIES = {
    "ceramic": ("CATG10827", "Ceramicas"),
    "laminate": ("CATG10826", "Pisos-Flotantes"),
}
FLOOR_CLASSIFICATIONS = {"ceramic": "G20041805", "laminate": "G20041804"}


def _text(value: Any) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFKD", str(value or "").lower())
        if not unicodedata.combining(char)
    )


def _params(category: str, page: int) -> dict[str, str | int]:
    if category not in CATEGORIES:
        raise ValueError("Sodimac only supports ceramic and laminate categories")
    if not isinstance(page, int) or isinstance(page, bool) or not 1 <= page <= 20:
        raise ValueError("page must be an integer between 1 and 20")
    category_id, category_name = CATEGORIES[category]
    return {
        "categoryId": category_id,
        "categoryName": category_name,
        "pgid": "95",
        "pid": LA_FLORIDA_PID,
        "store": "so_com",
        "page": page,
    }


def _in_scope(product: dict, category: str) -> bool:
    if product.get("sellerId") != "SODIMAC_CHILE":
        return False
    name = _text(product.get("displayName"))
    # A category contains marketplace/SPC and wall products as well as flooring.
    if any(word in name for word in ("vinilic", "spc", "porcelanato", "adhesiv")):
        return False
    classification = product.get("GSCCategoryId")
    if classification and classification != FLOOR_CLASSIFICATIONS[category]:
        return False
    if category == "laminate":
        return "piso" in name and ("flotante" in name or "laminado" in name)
    if "ceramica" not in name:
        return False
    if "muro" in name and "piso" not in name:
        return False
    if "wall" in name or "pared" in name:
        return False
    # The public floor classification disambiguates titles lacking the word "piso".
    return classification == FLOOR_CLASSIFICATIONS[category] or "piso" in name


def _price_value(price: dict) -> Any:
    value = price.get("price")
    return value[0] if isinstance(value, list) and value else value


def _general_price(prices: list) -> dict:
    # cmrPrice and campaigns can depend on cards/membership and are never the base price.
    for kind in ("internetPrice", "eventPrice", "normalPrice"):
        for price in prices:
            if (
                isinstance(price, dict)
                and price.get("type") == kind
                and price.get("crossed") is not True
            ):
                return price
    return {}


def _product_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = urlsplit(value)
    except ValueError:
        return None
    if parsed.scheme != "https" or parsed.netloc != "www.sodimac.cl":
        return None
    if not parsed.path.startswith("/sodimac-cl/articulo/"):
        return None
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


def _promotions(product: dict, prices: list) -> list[dict]:
    result = []
    for price in prices:
        if not isinstance(price, dict):
            continue
        if price.get("crossed") is True:
            result.append({
                "kind": "reference_price",
                "description": "Precio anterior tachado, no usado para el presupuesto",
                "price": _price_value(price),
                "conditional": False,
            })
        elif price.get("type") == "cmrPrice":
            result.append({
                "kind": "cmrPrice",
                "description": price.get("label") or "Precio condicionado a CMR",
                "price": _price_value(price),
                "conditional": True,
            })
    for campaign in product.get("promotions") or []:
        if isinstance(campaign, dict):
            campaign_prices = campaign.get("prices") or []
            first_price = (
                campaign_prices[0]
                if isinstance(campaign_prices, list) and campaign_prices
                else {}
            )
            result.append({
                "kind": "campaign",
                "description": campaign.get("description"),
                "campaign_name": campaign.get("campaignName"),
                "price": _price_value(first_price) if isinstance(first_price, dict) else None,
                "conditional": True,
            })
    return result


def _record(product: dict, category: str) -> dict:
    prices = product.get("prices")
    prices = prices if isinstance(prices, list) else []
    price = _general_price(prices)
    unit = price.get("unitPrice") or {}
    unit = unit if isinstance(unit, dict) else {}
    is_box = _text(unit.get("unitForSale")) == "caja"
    is_area = _text(unit.get("type")) == "m2" or _text(unit.get("unit")) in ("m2", "m²")
    media = product.get("mediaUrls") or []
    media = media if isinstance(media, list) else []
    coverage = unit.get("quantity") if is_box and is_area else None
    availability = "out_of_stock" if product.get("isOutOfStock") is True else "unknown"
    return {
        "source": "sodimac",
        "external_id": product.get("productId"),
        "sku": product.get("skuId"),
        "seller": product.get("sellerName"),
        "name": product.get("displayName"),
        "brand": product.get("brand"),
        "category": category,
        "product_url": _product_url(product.get("url")),
        "image_url": media[0] if media else None,
        "currency": "CLP",
        "package_price": _price_value(price),
        "coverage_m2": coverage,
        "sale_unit": "box" if is_box else "unknown",
        "availability": availability,
        "reported_price_m2": _price_value(unit) if is_area else None,
        "promotions": _promotions(product, prices),
        "evidence": {
            "seller_id": product.get("sellerId"),
            "seller_sku": product.get("sellerSkuId"),
            "classification": product.get("GSCCategoryId"),
            "merchant_category": product.get("merchantCategoryId"),
            "price_type": price.get("type"),
            "raw_package_price": _price_value(price),
            "raw_coverage_m2": coverage,
            "raw_price_m2": _price_value(unit) if is_area else None,
            "raw_sale_unit": unit.get("unitForSale"),
            "raw_availability": product.get("availability"),
            "raw_is_out_of_stock": product.get("isOutOfStock"),
            "location_parameters": {"pgid": "95", "pid": LA_FLORIDA_PID},
        },
    }


def parse_listing(payload: dict, category: str, page: int = 1) -> SourcePage:
    params = _params(category, page)
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
        raise SourceAccessError("invalid_format", "Sodimac response has no data object")
    data = payload["data"]
    products, pagination = data.get("results"), data.get("pagination")
    if not isinstance(products, list) or not isinstance(pagination, dict):
        raise SourceAccessError("invalid_format", "Sodimac listing/pagination format changed")
    try:
        current = int(pagination["currentPage"])
        per_page, count = int(pagination["perPage"]), int(pagination["count"])
    except (KeyError, TypeError, ValueError) as exc:
        raise SourceAccessError("invalid_format", "Sodimac pagination is incomplete") from exc
    if current != page or per_page <= 0 or count < 0:
        raise SourceAccessError("invalid_format", "Sodimac returned an unexpected page")
    records = [
        _record(product, category)
        for product in products
        if isinstance(product, dict) and _in_scope(product, category)
    ]
    return SourcePage(
        records=records,
        has_next=bool(products) and current * per_page < count,
        request_url=f"{LISTING_URL}?{urlencode(params)}",
        retrieved_count=len(products),
        excluded_count=len(products) - len(records),
        warnings=["La comuna no identifica una sucursal; stock no confirmado por el listado."],
    )


class SodimacAdapter:
    source = "sodimac"

    async def fetch_page(self, client: Any, category: str, page: int = 1) -> SourcePage:
        params = _params(category, page)
        payload = await client.get_json(LISTING_URL, params=params)
        return parse_listing(payload, category, page)
