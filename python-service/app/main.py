from fastapi import FastAPI

from app.api.health import router as health_router

app = FastAPI(title="Habita3D Python Service")

app.include_router(health_router)
