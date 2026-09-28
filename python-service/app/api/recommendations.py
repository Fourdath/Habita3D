"""Demonstration-only finish recommendations for the EP1 service integration."""

from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field, StrictInt, field_validator

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

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
