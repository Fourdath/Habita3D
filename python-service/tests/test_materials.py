from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.services.materials import normalize_record, number


def raw_publication(**changes):
    return {
        "source": "sodimac", "external_id": "100", "sku": "101", "seller": "Sodimac",
        "name": "Cerámica piso gris", "brand": "Marca", "category": "ceramic",
        "product_url": "https://www.sodimac.cl/sodimac-cl/articulo/100/piso",
        "currency": "CLP", "package_price": "15.980", "coverage_m2": "2.000",
        "sale_unit": "box", "reported_price_m2": "7.990", "availability": "unknown",
        **changes,
    }


@pytest.mark.parametrize(("value", "thousands", "expected"), [
    ("15.980", True, "15980"), ("15.980", False, "15.980"),
    ("2.000", False, "2.000"), ("2,39", False, "2.39"),
    ("$ 15.980", True, "15980"), ("CLP 15.980", True, "15980"),
    ("1.234,50", True, "1234.50"), (15980, True, "15980"),
    (2.39, False, "2.39"), (Decimal("2.000"), False, "2.000"),
])
def test_machine_numbers_and_chilean_text_use_field_semantics(value, thousands, expected):
    assert number(value, thousands=thousands) == Decimal(expected)


@pytest.mark.parametrize("value", [True, False, None, "NaN", "Infinity", float("inf"),
                                  "1.2.3", "dos", "1,2,3"])
def test_non_finite_or_malformed_numbers_are_rejected(value):
    with pytest.raises(ValueError):
        number(value)


def test_coverage_is_decimal_area_and_money_is_whole_clp():
    publication = normalize_record(raw_publication(), datetime.now(timezone.utc))
    assert publication.price_per_box_clp == 15980
    assert publication.coverage_per_box_m2 == Decimal("2")
    assert publication.price_per_m2_clp == Decimal("7990.00")
    assert publication.reported_price_m2_clp == Decimal("7990")
    assert publication.comparable
    assert publication.commune == "La Florida"
    assert publication.commune_code == "13110"


def test_real_box_division_is_used_instead_of_rounded_retail_unit_price():
    publication = normalize_record(raw_publication(package_price=19096, coverage_m2="2.39",
                                                  reported_price_m2=7989),
                                   datetime.now(timezone.utc))
    assert publication.price_per_m2_clp == Decimal("7989.96")
    assert publication.reported_price_m2_clp == Decimal("7989")


def test_checked_time_is_aware_and_display_uses_chilean_24_hour_format():
    checked = datetime(2026, 10, 18, 11, 5, tzinfo=timezone.utc)
    publication = normalize_record(raw_publication(), checked)
    assert publication.checked_at == checked
    assert publication.last_checked_display == "18/10/2026 08:05"
    with pytest.raises(ValueError, match="zona horaria"):
        normalize_record(raw_publication(), datetime(2026, 10, 18, 8, 5))


@pytest.mark.parametrize("change", [
    {"source": "another"}, {"category": "vinyl"}, {"seller": "Marketplace"},
    {"currency": "USD"}, {"external_id": ""}, {"name": " "}, {"seller": ""},
    {"package_price": 0}, {"package_price": -100}, {"package_price": True},
    {"package_price": "15,98"}, {"package_price": 1_000_000_001},
    {"coverage_m2": "0"}, {"coverage_m2": "-2"}, {"coverage_m2": "NaN"},
    {"coverage_m2": "1001"}, {"reported_price_m2": 0},
    {"availability": "maybe"}, {"sale_unit": "piece"},
    {"product_url": "http://www.sodimac.cl/100"},
    {"product_url": "https://www.sodimac.cl.attacker.example/100"},
    {"product_url": "https://user:password@www.sodimac.cl/100"},
    {"product_url": "https://www.sodimac.cl:8443/100"},
])
def test_incomparable_or_untrusted_publications_are_rejected(change):
    with pytest.raises(ValueError):
        normalize_record(raw_publication(**change), datetime.now(timezone.utc))


@pytest.mark.parametrize(("source_value", "expected"), [
    ("in_stock", "available"), ("out_of_stock", "unavailable"), ("unknown", "unknown"),
])
def test_availability_preserves_unknown_and_maps_explicit_signals(source_value, expected):
    publication = normalize_record(raw_publication(availability=source_value),
                                   datetime.now(timezone.utc))
    assert publication.availability == expected


@pytest.mark.parametrize("change", [{"coverage_m2": None}, {"sale_unit": "unknown"}])
def test_missing_coverage_or_sale_unit_does_not_invent_a_comparable_price(change):
    publication = normalize_record(raw_publication(**change), datetime.now(timezone.utc))
    assert publication.price_per_box_clp == 15980
    assert publication.coverage_per_box_m2 is None
    assert publication.price_per_m2_clp is None
    assert not publication.comparable


def test_identity_is_stable_across_price_title_and_capture_changes():
    first = normalize_record(raw_publication(), datetime(2026, 10, 18, 11, tzinfo=timezone.utc))
    second = normalize_record(raw_publication(package_price=17000, name="Cerámica actualizada",
                                             seller="SODIMAC"),
                              datetime(2026, 10, 18, 15, tzinfo=timezone.utc))
    assert first.publication_key == second.publication_key
    other_sku = normalize_record(raw_publication(sku="102"), datetime.now(timezone.utc))
    assert first.publication_key != other_sku.publication_key


def test_aliases_of_the_same_direct_seller_do_not_create_duplicate_publications():
    first = normalize_record(raw_publication(seller="Sodimac"), datetime.now(timezone.utc))
    alias = normalize_record(raw_publication(seller="SODIMAC_CHILE"), datetime.now(timezone.utc))
    assert first.publication_key == alias.publication_key
