"""Exact floor purchasing calculations, independent of scraping and persistence."""

from dataclasses import dataclass
from decimal import ROUND_CEILING, Decimal, localcontext


@dataclass(frozen=True)
class FloorEstimate:
    area_m2: Decimal
    required_area_m2: Decimal
    boxes: int
    purchased_area_m2: Decimal
    cost_clp: int


def calculate_floor(
    *,
    area_m2: Decimal,
    waste_percent: Decimal,
    coverage_per_box_m2: Decimal,
    price_per_box_clp: int,
) -> FloorEstimate:
    """Buy complete boxes after applying waste, with no intermediate rounding.

    The public API bounds input decimal precision; 60 digits also cover the
    product of length and width and prevent a rounded division from hiding a
    fractional final box. CLP box prices and final costs are whole pesos.
    """
    with localcontext() as context:
        context.prec = 60
        required = area_m2 * (Decimal(1) + waste_percent / Decimal(100))
        boxes = int((required / coverage_per_box_m2).to_integral_value(rounding=ROUND_CEILING))
        return FloorEstimate(
            area_m2=area_m2,
            required_area_m2=required,
            boxes=boxes,
            purchased_area_m2=coverage_per_box_m2 * boxes,
            cost_clp=price_per_box_clp * boxes,
        )


def room_area(*, length_m: Decimal, width_m: Decimal) -> Decimal:
    """Multiply the validated dimensions without binary floating point."""
    with localcontext() as context:
        context.prec = 60
        return length_m * width_m
