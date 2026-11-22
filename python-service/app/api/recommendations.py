"""Room floor suggestions and the legacy EP1 demonstration comparator."""

from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StrictInt, field_validator, model_validator

from app.api.floors import PublicationSnapshot, RoomSurface, StrictModel
from app.api.internal_auth import INTERNAL_AUTH_RESPONSES, require_internal_token
from app.services.floor_recommendations import MAX_SAFE_INTEGER, MAX_SUGGESTIONS, suggest_floors
from app.services.materials import Category, Source

router = APIRouter(
    prefix="/recommendations",
    tags=["recommendations"],
    dependencies=[Depends(require_internal_token)],
    responses=INTERNAL_AUTH_RESPONSES,
)

# Illustrative CLP per m² of finishes. These are not web prices or quotations.
DEMO_TIERS: tuple[tuple[Literal["premium", "standard", "basic"], int], ...] = (
    ("premium", 390_000),
    ("standard", 260_000),
    ("basic", 180_000),
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


@router.post("/compare", response_model=CompareResponse)
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


class FloorCandidate(PublicationSnapshot):
    category: Category


class FloorSuggestionsRequest(RoomSurface):
    available_budget_clp: Annotated[
        StrictInt, Field(ge=-MAX_SAFE_INTEGER, le=MAX_SAFE_INTEGER)
    ]
    preferred_category: Category | None = None
    preferred_source: Source | None = None
    candidates: Annotated[list[FloorCandidate], Field(max_length=40)]

    @model_validator(mode="after")
    def unique_candidates(self) -> "FloorSuggestionsRequest":
        keys = {candidate.publication_key for candidate in self.candidates}
        if len(keys) != len(self.candidates):
            raise ValueError("Las publicaciones candidatas deben ser únicas")
        return self


class FloorSuggestion(StrictModel):
    publication_key: str
    boxes: Annotated[StrictInt, Field(gt=0, le=MAX_SAFE_INTEGER)]
    cost_clp: Annotated[StrictInt, Field(gt=0, le=MAX_SAFE_INTEGER)]
    budget_excess_clp: Annotated[StrictInt, Field(ge=0, le=MAX_SAFE_INTEGER)]
    reasons: Annotated[list[str], Field(min_length=1, max_length=3)]


class FloorSuggestionsResponse(StrictModel):
    rule_version: Literal["floor-rules-v1"] = "floor-rules-v1"
    status: Literal["within_budget", "over_budget", "no_candidates"]
    items: Annotated[list[FloorSuggestion], Field(max_length=MAX_SUGGESTIONS)]


@router.post("/floors", response_model=FloorSuggestionsResponse)
def recommend_floors(request: FloorSuggestionsRequest) -> FloorSuggestionsResponse:
    """Recommend calculable offers using the persisted catalogue supplied by NestJS."""
    suggestions = suggest_floors(
        request.candidates,
        area_m2=request.resolved_area(),
        waste_percent=request.waste_percent,
        available_budget_clp=request.available_budget_clp,
        preferred_category=request.preferred_category,
        preferred_source=request.preferred_source,
    )
    if not suggestions:
        return FloorSuggestionsResponse(status="no_candidates", items=[])

    if any(
        max(item.boxes, item.cost_clp, item.budget_excess_clp) > MAX_SAFE_INTEGER
        for item in suggestions
    ):
        raise HTTPException(422, "El cálculo supera el rango admitido para costos de piso")
    return FloorSuggestionsResponse(
        status="over_budget" if suggestions[0].budget_excess_clp else "within_budget",
        items=[
            FloorSuggestion(
                publication_key=item.publication_key,
                boxes=item.boxes,
                cost_clp=item.cost_clp,
                budget_excess_clp=item.budget_excess_clp,
                reasons=item.explanation(),
            )
            for item in suggestions
        ],
    )
