"""Read Easy's public Next.js listings without browser sessions or fixed build IDs."""

import json
import os
import re
import unicodedata
from html.parser import HTMLParser
from typing import Any
from urllib.parse import quote, urlencode, urljoin, urlsplit

from app.sources.base import SourceAccessError, SourcePage

BASE_URL = "https://www.easy.cl"
SEARCH_TERMS = {"ceramic": "ceramica piso", "laminate": "piso flotante"}
PAGE_SIZE = 40  # Size used by the public listing; not the EP2 accepted-product limit.
LOCATION_COOKIES = {
    "X-Constructor-Region": "Metropolitana",
    "X-Constructor-Commune-Code": "13110",
}
# Public seller eligibility selected by Easy's normal La Florida selector, checked 2026-10-18.
# These identifiers are neither login credentials nor a promise of physical stock.
LA_FLORIDA_SELLERS = (
    "50159080",
    "502",
    "503",
    "510",
    "511",
    "512",
    "513",
    "514",
    "518",
    "522",
    "5990001",
    "5990003",
    "599vp",
    "643",
    "655",
    "659",
    "76134794",
    "77137860",
    "775",
    "77558186",
    "77924090",
    "843",
    "874",
    "91502000",
    "93129000",
    "93830000",
    "988",
    "mkt",
)


def _fold(value: Any) -> str:
    return "".join(
        c
        for c in unicodedata.normalize("NFKD", str(value or "").lower())
        if not unicodedata.combining(c)
    )


class _NextDataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.active = False
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.active = tag == "script" and dict(attrs).get("id") == "__NEXT_DATA__"

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self.active = False

    def handle_data(self, data: str) -> None:
        if self.active:
            self.parts.append(data)


def extract_next_data(html: str) -> dict[str, Any]:
    parser = _NextDataParser()
    parser.feed(html)
    try:
        payload = json.loads("".join(parser.parts))
    except (ValueError, TypeError) as exc:
        raise SourceAccessError(
            "source_schema_changed", "Easy no contiene un __NEXT_DATA__ válido"
        ) from exc
    if not isinstance(payload, dict):
        raise SourceAccessError("source_schema_changed", "El contenido de Easy no es un objeto")
    return payload


def _specifications(product: dict[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    for field in product.get("specifications") or []:
        if isinstance(field, dict):
            values = field.get("values") or []
            if isinstance(values, list):
                result[_fold(field.get("name"))] = " ".join(map(str, values))
    return result


def _matches_category(product: dict[str, Any], category: str) -> bool:
    name = _fold(product.get("productName"))
    specs = _specifications(product)
    product_type = _fold(specs.get("tipo de producto"))
    categories = _fold(" ".join(map(str, product.get("categories") or [])))
    if re.search(r"\b(spc|pvc|lvt|vinilic\w*)\b", " ".join([name, product_type, categories])):
        return False
    if category == "ceramic":
        ceramic = "ceramic" in name or "ceramic" in product_type
        # Floor/wall tiles are usable on floors; wall-only tiles are excluded.
        floor_use = "piso" in name or "piso" in product_type
        return ceramic and floor_use
    return ("piso flotante" in name or "laminad" in product_type) and (
        "pisos flotantes" in categories or "laminad" in product_type
    )


def _coverage(product: dict[str, Any], unit: str) -> Any:
    specs = _specifications(product)
    for key in ("rendimiento por caja", "cobertura por caja", "contenido por caja"):
        if specs.get(key):
            match = re.search(r"(\d+(?:[.,]\d+)?)\s*m(?:2|²)\b", specs[key], re.I)
            if match:
                return match.group(1)
    # The explicit m2box unit ties the title's area to a box, not a loose tile.
    if unit == "m2box":
        values = re.findall(
            r"(\d+(?:[.,]\d+)?)\s*m(?:2|²)\b", str(product.get("productName")), re.I
        )
        if len(values) == 1:
            return values[0]
    return None


def _product_url(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    url = urljoin(BASE_URL + "/", value)
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.netloc != "www.easy.cl":
        return None
    return url


def _promotions(product: dict[str, Any], offer: dict[str, Any]) -> list[dict[str, Any]]:
    promotions = []
    for promotion in offer.get("cardPromotions") or []:
        if isinstance(promotion, dict):
            promotions.append(
                {
                    "name": promotion.get("name"),
                    "type": promotion.get("type"),
                    "label": promotion.get("label"),
                    "id": promotion.get("id"),
                }
            )
    for ribbon in (offer.get("ribbons") or {}).get("bottom") or []:
        if isinstance(ribbon, dict) and (ribbon.get("returnValue") or ribbon.get("value")):
            promotions.append(
                {
                    "type": "conditional_ribbon",
                    "name": ribbon.get("returnValue") or ribbon.get("value"),
                }
            )
    prices = product.get("prices") or {}
    if prices.get("brandPrice") is not None:
        promotions.append({"type": "brand_price", "price": prices["brandPrice"]})
    return promotions


def parse_listing(
    payload: dict[str, Any],
    category: str,
    page: int,
    request_url: str,
) -> SourcePage:
    if category not in SEARCH_TERMS or page < 1:
        raise ValueError("Categoría o página de Easy inválida")
    page_props = payload.get("pageProps")
    if page_props is None:
        page_props = (payload.get("props") or {}).get("pageProps")
    listing = (page_props or {}).get("serverProductsResponse")
    if not isinstance(listing, dict) or not isinstance(listing.get("productList"), list):
        raise SourceAccessError("source_schema_changed", "Easy no contiene una lista de productos")
    products = listing["productList"]
    records: list[dict[str, Any]] = []
    for product in products:
        if not isinstance(product, dict) or product.get("isMarketplace") is not False:
            continue
        seller = _fold(product.get("sellerName")).strip()
        if seller and seller not in {"easy", "easy.cl", "cencosud retail s.a."}:
            continue
        if not _matches_category(product, category):
            continue
        commercial = product.get("commercialOffer") or {}
        offer = commercial.get("offerByZone") or commercial.get("defaultOffer") or {}
        prices = offer.get("prices") or product.get("prices") or {}
        per_unit = offer.get("pricesPerUnit") or product.get("pricesM2") or {}
        unit = per_unit.get("contentUnit", "")
        promotions = _promotions(product, offer)
        # Unconditional offerPrice is distinct from brand/card/coupon prices.
        conditions = [p for p in offer.get("cardPromotions") or [] if isinstance(p, dict)]
        conditional_only = conditions and not any(
            p.get("type") == "general" or p.get("id") == "GENERAL" for p in conditions
        )
        key = "offerPrice" if prices.get("offerPrice") and not conditional_only else "normalPrice"
        quantity = product.get("availableQuantity")
        records.append(
            {
                "source": "easy",
                "external_id": product.get("productId"),
                "sku": product.get("sku"),
                "seller": "Easy",
                "name": product.get("productName"),
                "brand": product.get("brand"),
                "category": category,
                "product_url": _product_url(product.get("linkText")),
                "image_url": product.get("imageUrl"),
                "currency": prices.get("currency"),
                "package_price": prices.get(key),
                "coverage_m2": _coverage(product, unit),
                "sale_unit": "box" if unit == "m2box" else "unknown",
                "availability": "unknown",
                "reported_price_m2": per_unit.get(key),
                "promotions": promotions,
                "evidence": {
                    "categories": product.get("categories"),
                    "product_type": _specifications(product).get("tipo de producto"),
                    "available_quantity_reported": quantity,
                    "availability_semantics": (
                        "No se ha validado como inventario físico ni stock local"
                    ),
                    "content_unit": unit,
                    "normal_price": prices.get("normalPrice"),
                    "offer_price": prices.get("offerPrice"),
                    "coverage_source": "specification_or_box_title",
                    "requested_commune_code": "13110",
                },
            }
        )
    total = listing.get("recordsFiltered")
    has_next = bool(products) and isinstance(total, (int, float)) and page * PAGE_SIZE < total
    return SourcePage(
        records=records,
        has_next=has_next,
        request_url=request_url,
        retrieved_count=len(products),
        excluded_count=len(products) - len(records),
    )


class EasyAdapter:
    source = "easy"

    def __init__(self, sellers: list[str] | None = None) -> None:
        configured = os.environ.get("EASY_SELLER_IDS")
        self._sellers = (
            sellers
            if sellers is not None
            else [s.strip() for s in configured.split(",") if s.strip()]
            if configured is not None
            else list(LA_FLORIDA_SELLERS)
        )

    async def fetch_page(self, client: Any, category: str, page: int) -> SourcePage:
        if category not in SEARCH_TERMS or not 1 <= page <= 20:
            raise ValueError("Categoría o página de Easy inválida")
        term = SEARCH_TERMS[category]
        encoded_term = quote(term, safe="")
        cookies = dict(LOCATION_COOKIES)
        if self._sellers:
            if not all(re.fullmatch(r"[A-Za-z0-9_-]{1,80}", s) for s in self._sellers):
                raise ValueError("Los IDs públicos de vendedores Easy no son válidos")
            cookies["X-Constructor-Sellers"] = quote(",".join(self._sellers), safe="")
        params = {"page": page} if page > 1 else None
        # Public HTML includes the same catalog as the Next data route; pagination does
        # not depend on a deployment's buildId and needs no user/browser session.
        url = f"{BASE_URL}/search/{encoded_term}"
        html = await client.get_text(url, params=params, cookies=cookies)
        payload = extract_next_data(html)
        request_url = url + ("?" + urlencode(params) if params else "")
        result = parse_listing(payload, category, page, request_url)
        result.warnings.append(
            "Easy: se envía el contexto público de La Florida; el listado no confirma la comuna "
            "en su respuesta ni garantiza inventario físico en una sucursal."
        )
        if not self._sellers:
            result.warnings.append("Easy: faltan los vendedores geográficos; contexto incompleto.")
        return result
