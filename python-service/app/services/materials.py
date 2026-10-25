"""Versioned contract and normalization of retailer publications.

Money is whole CLP; surfaces and comparable unit prices are exact decimal strings.
Unknown coverage/availability remain unknown, rather than becoming invented stock or costs.
"""

import hashlib
import re
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictInt

Source = Literal["sodimac", "easy"]
Category = Literal["ceramic", "laminate"]
Availability = Literal["available", "unavailable", "unknown"]
LOCATION_CODE = "13110"
HOSTS = {"sodimac": "www.sodimac.cl", "easy": "www.easy.cl"}


class Publication(BaseModel):
    model_config = ConfigDict(extra="forbid")
    publication_key: str
    source: Source
    external_id: str
    sku: str | None = None
    seller: str
    name: str
    brand: str | None = None
    category: Category
    product_url: str
    image_url: str | None = None
    currency: Literal["CLP"] = "CLP"
    price_type: Literal["public"] = "public"
    price_per_box_clp: Annotated[StrictInt, Field(gt=0)]
    sale_unit: Literal["box", "unknown"]
    coverage_per_box_m2: Annotated[Decimal, Field(gt=0, allow_inf_nan=False)] | None
    price_per_m2_clp: Decimal | None
    reported_price_m2_clp: Decimal | None = None
    availability: Availability = "unknown"
    commune_code: Literal["13110"] = LOCATION_CODE
    commune: Literal["La Florida"] = "La Florida"
    region: Literal["Metropolitana"] = "Metropolitana"
    checked_at: AwareDatetime
    last_checked_display: str
    comparable: bool
    promotions: list[dict[str, Any]] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)
    extractor_version: Literal["ep2-v1"] = "ep2-v1"


def number(value: Any, *, thousands: bool = False) -> Decimal:
    """Parse machine numbers and Chilean formatted values, rejecting booleans/NaN."""
    if isinstance(value, bool) or value is None:
        raise ValueError("Se requiere un número finito")
    text = str(value).strip().replace("\u00a0", "").replace(" ", "")
    if len(text) > 80:
        raise ValueError("Valor numérico demasiado extenso")
    text = re.sub(r"^(?:CLP|\$)", "", text, flags=re.I)
    if "," in text:
        if not re.fullmatch(r"\d{1,3}(?:\.\d{3})*,\d+|\d+,\d+", text):
            raise ValueError("Formato numérico inválido")
        text = text.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", text):
        # Raw JSON numeric values are never interpreted as thousands-separated text.
        if isinstance(value, str) and thousands:
            text = text.replace(".", "")
    try:
        result = Decimal(text)
    except InvalidOperation as exc:
        raise ValueError("Formato numérico inválido") from exc
    if not result.is_finite():
        raise ValueError("Se requiere un número finito")
    return result


def normalize_record(record: dict[str, Any], checked_at: datetime) -> Publication:
    if checked_at.tzinfo is None or checked_at.utcoffset() is None:
        raise ValueError("La captura debe tener zona horaria")
    source = record.get("source")
    category = record.get("category")
    if source not in HOSTS or category not in ("ceramic", "laminate"):
        raise ValueError("Fuente o categoría fuera del alcance")
    external_id = str(record.get("external_id") or "").strip()
    seller = str(record.get("seller") or "").strip()
    name = " ".join(str(record.get("name") or "").split())
    if not external_id or not seller or not name:
        raise ValueError("Faltan identificador, vendedor o nombre")
    if len(name) > 500 or len(external_id) > 100 or len(seller) > 100:
        raise ValueError("Campos de texto demasiado extensos")
    expected_sellers = {"sodimac": {"sodimac", "sodimac_chile"}, "easy": {"easy", "easy cl"}}
    if seller.casefold() not in expected_sellers[source]:
        raise ValueError("La publicación no es del vendedor directo acordado")
    seller = {"sodimac": "Sodimac", "easy": "Easy"}[source]
    if record.get("currency") != "CLP":
        raise ValueError("Moneda no comparable; se requiere CLP")
    product_url = str(record.get("product_url") or "")
    parsed = urlsplit(product_url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != HOSTS[source]
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
    ):
        raise ValueError("URL de procedencia inválida")
    price = number(record.get("package_price"), thousands=True)
    if price <= 0 or price != price.to_integral_value() or price > 1_000_000_000:
        raise ValueError("Precio por envase inválido; se requieren pesos CLP enteros")
    sale_unit = record.get("sale_unit", "unknown")
    if sale_unit not in ("box", "unknown"):
        raise ValueError("Unidad de venta fuera del alcance")
    coverage = None
    raw_coverage = record.get("coverage_m2")
    if raw_coverage is not None and sale_unit == "box":
        coverage = number(raw_coverage)
        if coverage < Decimal("0.000001") or coverage > 1000:
            raise ValueError("Cobertura por envase inválida")
        if coverage != coverage.quantize(Decimal("0.000001")):
            raise ValueError("La cobertura admite hasta seis decimales")
    reported = record.get("reported_price_m2")
    reported = number(reported, thousands=True) if reported is not None else None
    if reported is not None and reported <= 0:
        raise ValueError("Precio por m² inválido")
    availability = {
        "in_stock": "available",
        "out_of_stock": "unavailable",
        "available": "available",
        "unavailable": "unavailable",
        "unknown": "unknown",
    }.get(record.get("availability", "unknown"))
    if availability is None:
        raise ValueError("Disponibilidad no reconocida")
    sku = str(record["sku"]) if record.get("sku") else None
    identity = f"{source}|{external_id}|{sku or ''}|{seller.casefold()}|{LOCATION_CODE}|CLP|public"
    key = hashlib.sha256(identity.encode()).hexdigest()
    return Publication(
        publication_key=key,
        source=source,
        external_id=external_id,
        sku=sku,
        seller=seller,
        name=name,
        brand=record.get("brand") or None,
        category=category,
        product_url=product_url,
        image_url=record.get("image_url") or None,
        price_per_box_clp=int(price),
        sale_unit=sale_unit,
        coverage_per_box_m2=coverage,
        price_per_m2_clp=(price / coverage).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if coverage is not None
        else None,
        reported_price_m2_clp=reported,
        availability=availability,
        checked_at=checked_at,
        last_checked_display=checked_at.astimezone(ZoneInfo("America/Santiago")).strftime(
            "%d/%m/%Y %H:%M"
        ),
        comparable=coverage is not None,
        promotions=record.get("promotions", []),
        evidence=record.get("evidence", {}),
    )
