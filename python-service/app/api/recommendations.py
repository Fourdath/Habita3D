"""Recommendations for persisted floor publications and the legacy EP1 demo."""

from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, StrictInt, field_validator, model_validator

from app.api.floors import PublicationSnapshot, RoomMeasurements, StrictModel, WholePesos
from app.api.internal_auth import INTERNAL_AUTH_ERRORS, require_materials_token
from app.services.floor_budget import FloorEstimate, calculate_floor

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

# Illustrative CLP per m² of finishes. These are not web prices or quotations.
DEMO_TIERS: tuple[tuple[Literal["premium", "standard", "basic"], int], ...] = (
    ("premium", 390_000),
    ("standard", 260_000),
    ("basic", 180_000),
)

FloorCategory = Literal["ceramic", "laminate"]
FloorSource = Literal["sodimac", "easy"]
PublicationKey = Annotated[str, Field(min_length=1, max_length=256)]
EmptyReason = Literal["no_calculable_options", "all_dismissed"]
MAX_SAFE_INTEGER = 2**53 - 1


class CurrentRoom(RoomMeasurements):
    preferred_category: FloorCategory | None = None
    preferred_source: FloorSource | None = None


class OtherRoom(RoomMeasurements):
    publication: PublicationSnapshot | None = None


class RecommendationPublication(PublicationSnapshot):
    name: Annotated[str, Field(min_length=1, max_length=500)]
    category: FloorCategory


class FloorRecommendationsRequest(StrictModel):
    budget_clp: WholePesos
    room: CurrentRoom
    other_rooms: Annotated[list[OtherRoom], Field(max_length=99)] = Field(default_factory=list)
    publications: Annotated[list[RecommendationPublication], Field(max_length=100)]
    exclude: Annotated[list[PublicationKey], Field(max_length=40)] = Field(default_factory=list)
    selected_publication_key: PublicationKey | None = None

    @model_validator(mode="after")
    def distinct_rooms_and_publications(self) -> "FloorRecommendationsRequest":
        room_ids = {row.room_id for row in self.other_rooms}
        if len(room_ids) != len(self.other_rooms) or self.room.room_id in room_ids:
            raise ValueError("La habitación consultada y las otras deben ser distintas")
        if len({row.publication_key for row in self.publications}) != len(self.publications):
            raise ValueError("Las publicaciones candidatas deben ser únicas")
        return self


class FloorSuggestion(StrictModel):
    publication_key: str
    boxes: int
    total_clp: int
    fits_budget: bool
    budget_excess_clp: int
    reasons: list[str]
    price_stale: bool


class FloorRecommendationsResponse(StrictModel):
    available_budget_clp: int
    provisional_budget: bool
    empty_reason: EmptyReason | None
    suggestions: list[FloorSuggestion]


def estimate_purchase(
    area_m2: Decimal,
    waste_percent: Decimal,
    publication: PublicationSnapshot | None,
) -> FloorEstimate | None:
    if (
        publication is None
        or publication.price_per_box_clp is None
        or publication.coverage_per_box_m2 is None
    ):
        return None
    return calculate_floor(
        area_m2=area_m2,
        waste_percent=waste_percent,
        price_per_box_clp=publication.price_per_box_clp,
        coverage_per_box_m2=publication.coverage_per_box_m2,
    )


@router.post(
    "/floors",
    response_model=FloorRecommendationsResponse,
    dependencies=[Depends(require_materials_token)],
    responses=INTERNAL_AUTH_ERRORS,
)
def recommend_floors(request: FloorRecommendationsRequest) -> FloorRecommendationsResponse:
    """Rank eligible floor options from the project's persisted catalog snapshot."""
    committed = 0
    provisional = False
    for other in request.other_rooms:
        estimate = estimate_purchase(other.surface(), other.waste_percent, other.publication)
        if estimate is None:
            provisional = True
        else:
            committed += estimate.cost_clp

    room = request.room
    available = max(0, request.budget_clp - committed)
    if room.budget_clp is not None:
        available = min(available, room.budget_clp)

    stale_before = datetime.now(UTC) - timedelta(hours=24)
    room_surface = room.surface()
    excluded = set(request.exclude)
    eligible = False
    rankings: list[tuple[tuple[int, ...], FloorSuggestion]] = []
    for publication in request.publications:
        if publication.availability == "unavailable":
            continue
        if (
            request.selected_publication_key is not None
            and publication.publication_key != request.selected_publication_key
        ):
            continue
        estimate = estimate_purchase(room_surface, room.waste_percent, publication)
        # Both boxes and totals travel through JavaScript in the public API.
        if estimate is None or estimate.cost_clp > MAX_SAFE_INTEGER:
            continue
        eligible = True
        if request.selected_publication_key is None and publication.publication_key in excluded:
            continue
        category_match = publication.category == room.preferred_category
        source_match = publication.source == room.preferred_source
        cost = estimate.cost_clp
        excess = max(0, cost - available)
        fits = excess == 0
        reasons = ["Cabe en el presupuesto disponible" if fits else "Supera el presupuesto"]
        if category_match:
            reasons.append("Coincide con el tipo de piso preferido")
        if source_match:
            reasons.append("Coincide con la tienda preferida")
        rank = (0, -int(category_match), -int(source_match), cost) if fits else (1, excess)
        rankings.append(
            (
                rank,
                FloorSuggestion(
                    publication_key=publication.publication_key,
                    boxes=estimate.boxes,
                    total_clp=cost,
                    fits_budget=fits,
                    budget_excess_clp=excess,
                    reasons=reasons,
                    price_stale=publication.checked_at < stale_before,
                ),
            )
        )

    rankings.sort(key=lambda candidate: (candidate[0], candidate[1].publication_key))
    affordable = bool(rankings and rankings[0][1].fits_budget)
    suggestions = [result for _, result in rankings if result.fits_budget == affordable][:3]
    empty_reason = None if suggestions else "all_dismissed" if eligible else "no_calculable_options"
    return FloorRecommendationsResponse(
        available_budget_clp=available,
        provisional_budget=provisional,
        empty_reason=empty_reason,
        suggestions=suggestions,
    )


class CompareRequest(BaseModel):
    area_m2: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    budget_clp: Annotated[StrictInt, Field(gt=0)]

    @field_validator("area_m2", mode="before")
    @classmethod
    def area_must_be_a_number(cls, value: object) -> object:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("area_m2 must be a positive number")
        return value


class CompareResponse(BaseModel):
    recommended_tier: Literal["basic", "standard", "premium"]
    estimated_cost_clp: int
    budget_difference_clp: int
    fits_budget: bool
    reason: str
    source: Literal["demo"] = "demo"


def estimate_cost_clp(area_m2: float, unit_cost_clp: int) -> int:
    """Round to a whole peso in a stable way for decimal square-metre inputs."""
    return int(
        (Decimal(str(area_m2)) * Decimal(unit_cost_clp)).to_integral_value(rounding=ROUND_HALF_UP)
    )


@router.post(
    "/compare",
    response_model=CompareResponse,
    dependencies=[Depends(require_materials_token)],
    responses=INTERNAL_AUTH_ERRORS,
)
def compare_finishes(request: CompareRequest) -> CompareResponse:
    costs = [
        (tier, estimate_cost_clp(request.area_m2, unit_cost_clp))
        for tier, unit_cost_clp in DEMO_TIERS
    ]
    tier, estimated_cost = next(
        ((name, cost) for name, cost in costs if cost <= request.budget_clp),
        costs[-1],
    )
    difference = request.budget_clp - estimated_cost
    if difference >= 0:
        reason = (
            f"La terminación {tier} es la opción de mayor nivel dentro del presupuesto; "
            f"quedan {difference} CLP. Precios demostrativos, sin disponibilidad ni cotización web."
        )
    else:
        reason = (
            f"Ninguna terminación se ajusta al presupuesto; incluso la opción basic "
            f"supera el límite en {-difference} CLP. Precios demostrativos, "
            "sin disponibilidad ni cotización web."
        )

    return CompareResponse(
        recommended_tier=tier,
        estimated_cost_clp=estimated_cost,
        budget_difference_clp=difference,
        fits_budget=difference >= 0,
        reason=reason,
    )
