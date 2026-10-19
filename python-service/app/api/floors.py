"""Floor budgets from caller-supplied, already captured publication snapshots.

This endpoint neither fetches retail sites nor writes a database. In EP2 block 2,
NestJS must load the latest successfully persisted prices before calling it.
It does not select the latest snapshot or certify real-time stock itself.
"""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    field_validator,
    model_validator,
)

from app.services.floor_budget import calculate_floor, room_area

router = APIRouter(prefix="/floors", tags=["floors"])

PositiveDecimal = Annotated[
    Decimal,
    Field(gt=0, le=Decimal("10000000000"), max_digits=18, decimal_places=6),
]
WastePercent = Annotated[Decimal, Field(ge=0, le=100, max_digits=9, decimal_places=6)]
WholePesos = Annotated[StrictInt, Field(ge=0, le=1_000_000_000_000_000)]
BoxPrice = Annotated[StrictInt, Field(gt=0, le=1_000_000_000_000_000)]
Availability = Literal["available", "unavailable", "unknown"]


def reject_non_decimal_input(value: object) -> object:
    """Accept exact decimal strings and JSON numbers, never booleans or infinity."""
    if value is None:
        return value
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise ValueError("Use un número decimal o una cadena decimal finita")
    try:
        parsed = Decimal(str(value))
    except (ValueError, ArithmeticError) as error:
        raise ValueError("Use un número decimal finito") from error
    if not parsed.is_finite():
        raise ValueError("El número debe ser finito")
    return parsed


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PublicationSnapshot(StrictModel):
    publication_key: Annotated[str, Field(min_length=1, max_length=256)]
    source: Literal["sodimac", "easy"]
    price_per_box_clp: BoxPrice | None = None
    coverage_per_box_m2: PositiveDecimal | None = None
    currency: Literal["CLP"]
    price_type: Literal["public"] = "public"
    checked_at: datetime
    availability: Availability = "unknown"

    @field_validator("publication_key")
    @classmethod
    def nonblank_key(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("publication_key no puede estar vacío")
        return value

    @field_validator("coverage_per_box_m2", mode="before")
    @classmethod
    def decimal_coverage(cls, value: object) -> object:
        return reject_non_decimal_input(value)

    @field_validator("checked_at", mode="before")
    @classmethod
    def date_is_not_a_timestamp_number(cls, value: object) -> object:
        if not isinstance(value, (str, datetime)):
            raise ValueError("checked_at debe ser una fecha ISO 8601 con zona horaria")
        return value

    @field_validator("checked_at")
    @classmethod
    def date_has_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("checked_at debe incluir zona horaria")
        return value


class RoomBudgetRequest(StrictModel):
    room_id: Annotated[str, Field(min_length=1, max_length=100)]
    area_m2: PositiveDecimal | None = None
    length_m: PositiveDecimal | None = None
    width_m: PositiveDecimal | None = None
    waste_percent: WastePercent = Decimal("10")
    budget_clp: WholePesos | None = None
    publication: PublicationSnapshot

    @field_validator("area_m2", "length_m", "width_m", "waste_percent", mode="before")
    @classmethod
    def decimal_quantities(cls, value: object) -> object:
        return reject_non_decimal_input(value)

    @field_validator("room_id")
    @classmethod
    def nonblank_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("room_id no puede estar vacío")
        return value

    @model_validator(mode="after")
    def exactly_one_area_mode(self) -> "RoomBudgetRequest":
        has_dimensions = self.length_m is not None or self.width_m is not None
        if self.area_m2 is not None and has_dimensions:
            raise ValueError("Indique área directa o largo y ancho, nunca ambos")
        if self.area_m2 is None and (self.length_m is None or self.width_m is None):
            raise ValueError("Indique área directa o ambos valores de largo y ancho")
        return self


class FloorBudgetRequest(StrictModel):
    rooms: Annotated[list[RoomBudgetRequest], Field(min_length=1, max_length=100)]
    budget_clp: WholePesos | None = None

    @model_validator(mode="after")
    def unique_rooms(self) -> "FloorBudgetRequest":
        ids = [room.room_id for room in self.rooms]
        if len(ids) != len(set(ids)):
            raise ValueError("Los room_id deben ser únicos")
        return self


class RoomBudgetResponse(StrictModel):
    room_id: str
    publication_key: str
    source: Literal["sodimac", "easy"]
    currency: Literal["CLP"] = "CLP"
    price_type: Literal["public"] = "public"
    status: Literal["calculated", "uncalculable"]
    reasons: list[Literal["missing_price", "missing_coverage"]]
    area_m2: Decimal
    waste_percent: Decimal
    required_area_m2: Decimal | None = None
    coverage_per_box_m2: Decimal | None = None
    price_per_box_clp: int | None = None
    boxes: int | None = None
    purchased_area_m2: Decimal | None = None
    cost_clp: int | None = None
    budget_clp: int | None = None
    budget_difference_clp: int | None = None
    budget_excess_clp: int | None = None
    fits_budget: bool | None = None
    availability: Availability
    checked_at: datetime
    last_check_display: str


class FloorBudgetResponse(StrictModel):
    currency: Literal["CLP"] = "CLP"
    status: Literal["complete", "partial", "uncalculable"]
    rooms: list[RoomBudgetResponse]
    calculated_rooms: int
    uncalculable_rooms: int
    calculable_subtotal_clp: int
    total_cost_clp: int | None
    budget_clp: int | None
    budget_difference_clp: int | None
    budget_excess_clp: int | None
    fits_budget: bool | None
    calculation_basis: Literal["supplied_publication_snapshots"] = "supplied_publication_snapshots"
    scope: Literal["floor_boxes_only"] = "floor_boxes_only"


def budget_difference(cost: int | None, budget: int | None) -> dict:
    if cost is None or budget is None:
        return {"budget_difference_clp": None, "budget_excess_clp": None, "fits_budget": None}
    difference = budget - cost
    return {
        "budget_difference_clp": difference,
        "budget_excess_clp": max(0, -difference),
        "fits_budget": difference >= 0,
    }


@router.post("/budget", response_model=FloorBudgetResponse)
def floor_budget(request: FloorBudgetRequest) -> FloorBudgetResponse:
    """Calculate whole-box floor purchases using ordinary public CLP box prices.

    Missing price or coverage leaves the room uncalculable. An incomplete
    project exposes an explicit partial subtotal and no final total or budget
    verdict. Availability is passed through, never inferred from a price.
    The caller declares an ordinary public price; this endpoint does not verify
    its freshness or commercial conditions against the original retailer.
    """
    results: list[RoomBudgetResponse] = []
    for room in request.rooms:
        publication = room.publication
        area = room.area_m2
        if area is None:
            # The request validator guarantees both dimensions in this mode.
            assert room.length_m is not None and room.width_m is not None
            area = room_area(length_m=room.length_m, width_m=room.width_m)
        reasons = []
        if publication.price_per_box_clp is None:
            reasons.append("missing_price")
        if publication.coverage_per_box_m2 is None:
            reasons.append("missing_coverage")
        values = {}
        cost = None
        if not reasons:
            assert publication.price_per_box_clp is not None
            assert publication.coverage_per_box_m2 is not None
            estimate = calculate_floor(
                area_m2=area,
                waste_percent=room.waste_percent,
                coverage_per_box_m2=publication.coverage_per_box_m2,
                price_per_box_clp=publication.price_per_box_clp,
            )
            cost = estimate.cost_clp
            values = {
                "required_area_m2": estimate.required_area_m2,
                "boxes": estimate.boxes,
                "purchased_area_m2": estimate.purchased_area_m2,
                "cost_clp": cost,
            }
        results.append(
            RoomBudgetResponse(
                room_id=room.room_id,
                publication_key=publication.publication_key,
                source=publication.source,
                status="uncalculable" if reasons else "calculated",
                reasons=reasons,
                area_m2=area,
                waste_percent=room.waste_percent,
                coverage_per_box_m2=publication.coverage_per_box_m2,
                price_per_box_clp=publication.price_per_box_clp,
                budget_clp=room.budget_clp,
                availability=publication.availability,
                checked_at=publication.checked_at,
                last_check_display=publication.checked_at.astimezone(
                    ZoneInfo("America/Santiago")
                ).strftime("%d/%m/%Y %H:%M"),
                **values,
                **budget_difference(cost, room.budget_clp),
            )
        )
    calculated = sum(room.status == "calculated" for room in results)
    subtotal = sum(room.cost_clp for room in results if room.cost_clp is not None)
    complete = calculated == len(results)
    total = subtotal if complete else None
    return FloorBudgetResponse(
        status="complete" if complete else "partial" if calculated else "uncalculable",
        rooms=results,
        calculated_rooms=calculated,
        uncalculable_rooms=len(results) - calculated,
        calculable_subtotal_clp=subtotal,
        total_cost_clp=total,
        budget_clp=request.budget_clp,
        **budget_difference(total, request.budget_clp),
    )
