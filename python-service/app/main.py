from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.recommendations import router as recommendations_router

app = FastAPI(title="Habita3D Python Service")

app.include_router(health_router)
app.include_router(recommendations_router)
