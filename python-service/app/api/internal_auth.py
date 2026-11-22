"""Shared authentication for service-to-service API calls."""

import os
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader

_key = APIKeyHeader(
    name="X-Materials-Token",
    scheme_name="InternalMaterialsToken",
    description="Credencial interna compartida con NestJS.",
    auto_error=False,
)

INTERNAL_AUTH_RESPONSES = {
    401: {"description": "Credencial interna ausente o inválida"},
    503: {"description": "Credencial interna del servicio sin configurar"},
}


def require_internal_token(received: Annotated[str | None, Depends(_key)]) -> None:
    configured = os.environ.get("MATERIALS_API_TOKEN", "")
    if not 24 <= len(configured) <= 256 or configured.startswith("replace-"):
        raise HTTPException(503, "Credencial interna del servicio sin configurar")
    if not received or not 24 <= len(received) <= 256 or not secrets.compare_digest(
        configured.encode("utf-8"), received.encode("utf-8")
    ):
        raise HTTPException(401, "Credencial interna inválida")
