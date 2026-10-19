"""Bounded acquisition, validation, stable sampling and reproducible quality counts."""

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from app.services.capture_store import CaptureStore
from app.services.materials import Category, Publication, Source, normalize_record
from app.sources.base import SourceAccessError, SourceAdapter

logger = logging.getLogger("habita3d.materials")


class CaptureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sources: Annotated[list[Source], Field(min_length=1, max_length=2)] = ["sodimac", "easy"]
    categories: Annotated[list[Category], Field(min_length=1, max_length=2)] = [
        "ceramic",
        "laminate",
    ]
    limit_per_category: Annotated[StrictInt, Field(ge=1, le=10)] = 10

    @model_validator(mode="after")
    def no_duplicate_groups(self):
        if len(set(self.sources)) != len(self.sources):
            raise ValueError("No repita fuentes")
        if len(set(self.categories)) != len(self.categories):
            raise ValueError("No repita categorías")
        return self


class QualityMetrics(BaseModel):
    retrieved_records: int = 0
    valid_records: int = 0
    rejected_records: int = 0
    excluded_records: int = 0
    duplicate_records: int = 0
    comparable_records: int = 0
    selected_records: int = 0
    validity_percent: Decimal | None = None
    duplicates_percent: Decimal | None = None

    def finish(self):
        if self.retrieved_records:
            self.validity_percent = (
                Decimal(self.valid_records) * 100 / self.retrieved_records
            ).quantize(Decimal("0.01"))
            self.duplicates_percent = (
                Decimal(self.duplicate_records) * 100 / self.retrieved_records
            ).quantize(Decimal("0.01"))


class GroupResult(BaseModel):
    source: Source
    category: Category
    status: Literal["complete", "partial", "failed"]
    metrics: QualityMetrics
    pages: int
    request_urls: list[str]
    errors: list[dict[str, str]]
    warnings: list[str]
    missing_publication_keys: list[str]


class CaptureResult(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    run_id: str
    request_id: str
    origin: Literal["live"] = "live"
    trigger: Literal["manual", "scheduled"]
    scheduled_for: str | None
    started_at: datetime
    finished_at: datetime
    status: Literal["complete", "partial", "failed"]
    groups: list[GroupResult]
    publications: list[Publication]
    updated_publication_keys: list[str]
    retained_publication_keys: list[str]
    storage: Literal["local_evidence_cache"] = "local_evidence_cache"


async def acquire_group(
    adapter: SourceAdapter, client, category: Category, limit: int, previous: list[Publication]
) -> tuple[GroupResult, list[Publication]]:
    metrics = QualityMetrics()
    targets = {record.publication_key for record in previous}
    found: dict[str, Publication] = {}
    seen: set[str] = set()
    errors, warnings, urls = [], [], []
    pages = 0
    for page in range(1, 4):
        try:
            response = await adapter.fetch_page(client, category, page)
            pages += 1
            urls.append(response.request_url)
            warnings.extend(response.warnings)
            metrics.retrieved_records += (
                response.retrieved_count
                if (response.retrieved_count is not None)
                else len(response.records) + response.excluded_count
            )
            metrics.excluded_records += response.excluded_count
            checked_at = datetime.now(timezone.utc)
            for record in response.records:
                try:
                    publication = normalize_record(record, checked_at)
                    if publication.source != adapter.source or publication.category != category:
                        raise ValueError("La respuesta no coincide con el grupo solicitado")
                except (ValueError, TypeError) as exc:
                    metrics.rejected_records += 1
                    errors.append({"code": "invalid_record", "message": str(exc)[:200]})
                    continue
                metrics.valid_records += 1
                metrics.comparable_records += int(publication.comparable)
                key = publication.publication_key
                if key in seen:
                    metrics.duplicate_records += 1
                    continue
                seen.add(key)
                if not targets or key in targets:
                    found[key] = publication
            if targets and targets.issubset(found):
                break
            if not targets and len(found) >= limit:
                break
            if not response.has_next:
                break
        except SourceAccessError as exc:
            errors.append({"code": exc.code, "message": str(exc)[:200]})
            break
        except (KeyError, TypeError, ValueError) as exc:
            errors.append({"code": "source_schema_changed", "message": str(exc)[:200]})
            break
    if not targets:
        # Prefer calculable publications, then keep a deterministic bounded sample.
        selected = sorted(found.values(), key=lambda p: (not p.comparable, p.publication_key))[
            :limit
        ]
    else:
        selected = list(found.values())
    missing = sorted(targets - found.keys())
    if missing:
        warnings.append(
            "Se conservan los datos previos de publicaciones no encontradas; "
            "no se avanza su fecha de comprobación."
        )
    if not selected and not errors:
        errors.append(
            {"code": "no_usable_records", "message": "No se obtuvieron registros válidos"}
        )
    metrics.selected_records = len(selected)
    metrics.finish()
    status = (
        "complete"
        if selected and not missing and not any(e["code"] != "invalid_record" for e in errors)
        else "partial"
        if selected
        else "failed"
    )
    group = GroupResult(
        source=adapter.source,
        category=category,
        status=status,
        metrics=metrics,
        pages=pages,
        request_urls=urls,
        errors=errors[:100],
        warnings=warnings,
        missing_publication_keys=missing,
    )
    return group, selected


async def capture(
    request: CaptureRequest,
    client,
    adapters: dict[str, SourceAdapter],
    store: CaptureStore,
    *,
    request_id: str = "cli",
    slot: str | None = None,
) -> CaptureResult:
    started_at = datetime.now(timezone.utc)
    with store.locked():
        state = store.read()
        if slot and slot in state["slots"]:
            raise ValueError("Esta franja ya fue intentada; no se repiten solicitudes")
        snapshot = {
            key: Publication.model_validate(record) for key, record in state["publications"].items()
        }
        groups, updated = [], []
        for source in request.sources:
            for category in request.categories:
                previous = [
                    p for p in snapshot.values() if p.source == source and p.category == category
                ]
                group, publications = await acquire_group(
                    adapters[source],
                    client,
                    category,
                    request.limit_per_category,
                    previous,
                )
                groups.append(group)
                for publication in publications:
                    snapshot[publication.publication_key] = publication
                    updated.append(publication.publication_key)
                logger.info(
                    "capture_group",
                    extra={
                        "source": source,
                        "category": category,
                        "result": group.status,
                        "request_id": request_id,
                    },
                )
        result = CaptureResult(
            run_id=str(uuid4()),
            request_id=request_id,
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
            scheduled_for=slot,
            trigger="scheduled" if slot else "manual",
            status="complete"
            if all(g.status == "complete" for g in groups)
            else "partial"
            if updated
            else "failed",
            groups=groups,
            publications=sorted(snapshot.values(), key=lambda p: p.publication_key),
            updated_publication_keys=updated,
            retained_publication_keys=sorted(set(snapshot) - set(updated)),
        )
        store.save(result.model_dump(mode="json"), slot=slot)
        return result
