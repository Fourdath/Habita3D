"""Shared credential for server-to-server material processing and acquisition."""

import os
import secrets
from typing import Annotated

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

materials_token_header = APIKeyHeader(
    name="X-Materials-Token", scheme_name="MaterialsToken", auto_error=False
)
INTERNAL_AUTH_ERRORS = {
    401: {"description": "Credencial interna ausente o inválida"},
    503: {"description": "Credencial interna no configurada"},
}


def require_materials_token(
    token: Annotated[str | None, Security(materials_token_header)],
) -> None:
    configured = os.environ.get("MATERIALS_API_TOKEN", "")
    if len(configured) < 24 or configured.startswith("replace-"):
        raise HTTPException(503, "Configure MATERIALS_API_TOKEN (mínimo 24 caracteres)")
    if not token or not secrets.compare_digest(configured.encode("utf-8"), token.encode("utf-8")):
        raise HTTPException(401, "Credencial interna inválida")
