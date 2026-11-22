"""Rank eligible public floor offers using declared room preferences."""

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol

from app.services.floor_budget import calculate_floor
from app.services.materials import Availability, Category, Source

MAX_SAFE_INTEGER = 2**53 - 1
MAX_SUGGESTIONS = 3


class Candidate(Protocol):
    publication_key: str
    category: Category
    source: Source
    availability: Availability
    price_per_box_clp: int | None
    coverage_per_box_m2: Decimal | None


@dataclass(frozen=True)
class Suggestion:
    publication_key: str
    boxes: int
    cost_clp: int
    budget_excess_clp: int
    category_match: bool
    source_match: bool

    def explanation(self) -> list[str]:
        if self.budget_excess_clp:
            return [f"Supera el presupuesto disponible en {self.budget_excess_clp} CLP."]

        reasons = ["El costo de las cajas cabe en el presupuesto disponible."]
        if self.category_match:
            reasons.append("Coincide con el tipo de piso preferido.")
        if self.source_match:
            reasons.append("Coincide con la tienda preferida.")
        return reasons


def suggest_floors(
    candidates: Iterable[Candidate],
    *,
    area_m2: Decimal,
    waste_percent: Decimal,
    available_budget_clp: int,
    preferred_category: Category | None,
    preferred_source: Source | None,
) -> list[Suggestion]:
    estimates = []
    for candidate in candidates:
        price = candidate.price_per_box_clp
        coverage = candidate.coverage_per_box_m2
        if candidate.availability == "unavailable" or price is None or coverage is None:
            continue
        estimate = calculate_floor(
            area_m2=area_m2,
            waste_percent=waste_percent,
            coverage_per_box_m2=coverage,
            price_per_box_clp=price,
        )
        estimates.append(
            Suggestion(
                publication_key=candidate.publication_key,
                boxes=estimate.boxes,
                cost_clp=estimate.cost_clp,
                budget_excess_clp=max(0, estimate.cost_clp - available_budget_clp),
                category_match=candidate.category == preferred_category,
                source_match=candidate.source == preferred_source,
            )
        )

    affordable = [item for item in estimates if item.budget_excess_clp == 0]
    if affordable:
        affordable.sort(
            key=lambda item: (
                not item.category_match, not item.source_match, item.cost_clp, item.publication_key
            )
        )
        return affordable[:MAX_SUGGESTIONS]

    estimates.sort(key=lambda item: (item.budget_excess_clp, item.publication_key))
    return estimates[:MAX_SUGGESTIONS]
