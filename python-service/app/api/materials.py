"""Block 1 processing contract; data management through NestJS follows in block 2."""

import os
import secrets
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.services.capture_store import CaptureBusyError, CaptureStore
from app.services.captures import CaptureRequest, CaptureResult, capture
from app.services.materials import Publication, normalize_record

router = APIRouter(prefix="/materials", tags=["materials"])


def require_capture_token(x_materials_token: Annotated[str | None, Header()] = None) -> None:
    configured = os.environ.get("MATERIALS_API_TOKEN", "")
    if len(configured) < 24 or configured.startswith("replace-"):
        raise HTTPException(503, "Configure MATERIALS_API_TOKEN (mínimo 24 caracteres)")
    if not x_materials_token or not secrets.compare_digest(
        configured.encode("utf-8"), x_materials_token.encode("utf-8")
    ):
        raise HTTPException(401, "Credencial de captura inválida")


def get_store() -> CaptureStore:
    return CaptureStore(Path(os.environ.get("MATERIALS_DATA_DIR", "data/materials")))


def get_adapters():
    from app.sources.easy import EasyAdapter
    from app.sources.sodimac import SodimacAdapter

    return {"sodimac": SodimacAdapter(), "easy": EasyAdapter()}


def get_source_client():
    from app.sources.client import SafeSourceClient

    return SafeSourceClient()


class NormalizeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    records: Annotated[list[dict[str, Any]], Field(min_length=1, max_length=200)]
    checked_at: AwareDatetime

    @field_validator("checked_at", mode="before")
    @classmethod
    def iso_date(cls, value):
        if not isinstance(value, (str, datetime)):
            raise ValueError("Se requiere fecha ISO con zona horaria")
        return value


class NormalizeResult(BaseModel):
    publications: list[Publication]
    rejected: list[dict[str, Any]]
    duplicate_records: int


@router.post("/normalize", response_model=NormalizeResult)
def normalize(request: NormalizeRequest) -> NormalizeResult:
    """Pure validation of canonical raw records; never calls a retailer or writes a file."""
    publications, rejected, seen = [], [], set()
    duplicates = 0
    for index, record in enumerate(request.records):
        try:
            publication = normalize_record(record, request.checked_at)
        except (ValueError, TypeError) as exc:
            rejected.append({"index": index, "code": "invalid_record", "message": str(exc)[:200]})
            continue
        if publication.publication_key in seen:
            duplicates += 1
        else:
            publications.append(publication)
            seen.add(publication.publication_key)
    return NormalizeResult(
        publications=publications, rejected=rejected, duplicate_records=duplicates
    )


@router.post(
    "/captures", response_model=CaptureResult, dependencies=[Depends(require_capture_token)]
)
async def create_capture(
    request: CaptureRequest,
    http_request: Request,
    store: CaptureStore = Depends(get_store),
    adapters=Depends(get_adapters),
    client=Depends(get_source_client),
) -> CaptureResult:
    """Explicit protected acquisition. Browsing/catalog reads must never call this route."""
    try:
        async with client:
            return await capture(
                request, client, adapters, store, request_id=http_request.state.request_id
            )
    except CaptureBusyError as exc:
        raise HTTPException(409, str(exc)) from exc
    except (OSError, ValueError) as exc:
        raise HTTPException(503, "No se pudo leer o guardar la evidencia local de captura") from exc


@router.get("/status", dependencies=[Depends(require_capture_token)])
def capture_status(store: CaptureStore = Depends(get_store)) -> dict:
    """Local acquisition evidence only, not the future application's catalogue API."""
    try:
        state = store.read()
    except (OSError, ValueError) as exc:
        raise HTTPException(503, "No se pudo leer la evidencia local") from exc
    last = state.get("last_capture")
    return {
        "storage": "local_evidence_cache",
        "publication_count": len(state["publications"]),
        "last_capture": {
            key: last[key]
            for key in (
                "run_id",
                "status",
                "started_at",
                "finished_at",
                "groups",
            )
        }
        if last
        else None,
        "server_time": datetime.now().astimezone().isoformat(),
    }
