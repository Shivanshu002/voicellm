import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config, dialer
from .db import Base, engine
from .routers import auth, calls, campaigns, company, internal

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app):
    Base.metadata.create_all(engine)
    dialer.start()
    yield
    dialer.stop()


app = FastAPI(title="VoiceLLM", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
for r in (auth.router, company.router, campaigns.router, calls.router, internal.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"ok": True}
