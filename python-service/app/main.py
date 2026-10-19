import re
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request

from app.api.floors import router as floors_router
from app.api.health import router as health_router
from app.api.materials import router as materials_router
from app.api.recommendations import router as recommendations_router
from app.observability import configure_logging

logger = configure_logging()

app = FastAPI(title="Habita3D Python Service", version="2.0.0")


@app.middleware("http")
async def correlate_request(request: Request, call_next):
    incoming = request.headers.get("X-Request-ID", "")
    request_id = incoming if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", incoming) else str(uuid4())
    request.state.request_id = request_id
    started = perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "http_request",
        extra={
            "request_id": request_id,
            "result": response.status_code,
            "duration_ms": round((perf_counter() - started) * 1000, 2),
        },
    )
    return response


app.include_router(health_router)
app.include_router(recommendations_router)
app.include_router(floors_router)
app.include_router(materials_router)
