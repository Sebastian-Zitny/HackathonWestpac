"""FastAPI application for the AutoTopUp AI prototype."""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from .db import Database
from .ml.trust_engine import get_model
from .seed import DEFAULT_SETTINGS, SCENARIOS, seed
from .service import Service, ServiceError

HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


class Notifications(BaseModel):
    push: bool = True
    email: bool = False
    transfer_receipts: bool = True
    weekly_summary: bool = True


class Settings(BaseModel):
    enabled: bool
    source_account_id: str
    destination_account_id: str
    max_per_transfer_cents: int = Field(ge=100, le=500_000)
    max_daily_total_cents: int = Field(ge=100, le=1_000_000)
    max_daily_count: int = Field(ge=1, le=20)
    min_savings_reserve_cents: int = Field(ge=0, le=10_000_000)
    quick_hours_start: str = Field(pattern=HHMM)
    quick_hours_end: str = Field(pattern=HHMM)
    unfamiliar_requires_enhanced: bool
    quick_approve_enabled: bool
    preferred_auth: Literal["biometric", "pin"]
    notifications: Notifications

    @field_validator("destination_account_id")
    @classmethod
    def distinct(cls, v, info):
        if v == info.data.get("source_account_id"):
            raise ValueError("source and destination accounts must differ")
        return v


class IntentIn(BaseModel):
    merchant_id: str
    amount_cents: int = Field(gt=0, le=2_000_000)


class ApproveIn(BaseModel):
    method: Literal["tap", "biometric", "pin"]
    pin: Optional[str] = Field(default=None, max_length=8)
    biometric_ok: bool = False
    confirm_recognised: bool = False


class AssessIn(BaseModel):
    merchant_id: str
    amount_cents: int = Field(gt=0, le=2_000_000)


class ResetIn(BaseModel):
    scenario_id: int = 2
    keep_settings: bool = False
    date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class ClockIn(BaseModel):
    time: str = Field(pattern=HHMM)


class DemoFlags(BaseModel):
    security_hold: Optional[bool] = None
    app_session_authenticated: Optional[bool] = None


def create_app(db_path: str | None = None, seed_on_start: bool = True) -> FastAPI:
    db = Database(db_path)
    svc = Service(db)
    app = FastAPI(title="AutoTopUp AI (prototype)", version="1.0.0",
                  description="Unofficial student hackathon prototype. Simulated data only.")
    app.state.db, app.state.svc = db, svc
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    get_model()  # load or train once at startup
    if seed_on_start and not db.get_kv("settings"):
        seed(db, 2)

    @app.exception_handler(ServiceError)
    async def _svc_err(_: Request, e: ServiceError):
        return JSONResponse(status_code=e.status, content={"error": e.code, "message": e.message, **e.extra})

    @app.get("/api/health")
    def health():
        return {"ok": True, "model": get_model().meta.get("model_version"), "runs_locally": True}

    @app.get("/api/state")
    def state():
        return svc.state()

    @app.get("/api/settings")
    def get_settings():
        return svc.settings()

    @app.put("/api/settings")
    def put_settings(s: Settings):
        data = s.model_dump()
        db.set_kv("settings", data)
        db.audit("settings_updated", data)
        return data

    @app.post("/api/assess")
    def assess(body: AssessIn):
        return svc.assess(body.merchant_id, body.amount_cents)

    @app.post("/api/payments")
    def create_payment(body: IntentIn):
        return svc.create_intent(body.merchant_id, body.amount_cents)

    @app.get("/api/payments/{iid}")
    def get_payment(iid: str):
        return svc.intent_view(iid)

    @app.post("/api/payments/{iid}/tap")
    def tap(iid: str):
        return svc.tap(iid)

    @app.post("/api/topups/{oid}/approve")
    def approve(oid: str, body: ApproveIn):
        return svc.approve(oid, body.method, body.pin, body.biometric_ok, body.confirm_recognised)

    @app.post("/api/topups/{oid}/decline")
    def decline(oid: str):
        return svc.decline(oid)

    @app.get("/api/insights")
    def insights():
        return svc.insights()

    @app.get("/api/model")
    def model_info():
        return get_model().meta

    @app.get("/api/scenarios")
    def scenarios():
        return list(SCENARIOS.values())

    @app.post("/api/demo/reset")
    def reset(body: ResetIn):
        if body.scenario_id not in SCENARIOS:
            raise ServiceError(422, "bad_scenario", "Scenario must be 1, 2 or 3")
        day = datetime.fromisoformat(body.date) if body.date else None
        sc = seed(db, body.scenario_id, now=day, keep_settings=body.keep_settings)
        return {"scenario": sc, "state": svc.state()}

    @app.post("/api/demo/clock")
    def set_clock(body: ClockIn):
        h, m = map(int, body.time.split(":"))
        db.set_now(db.now().replace(hour=h, minute=m, second=0))
        return {"now": db.now().isoformat()}

    @app.post("/api/demo/flags")
    def flags(body: DemoFlags):
        if body.security_hold is not None:
            db.set_kv("security_hold", body.security_hold)
        if body.app_session_authenticated is not None:
            db.set_kv("app_session_authenticated", body.app_session_authenticated)
        return {"security_hold": db.get_kv("security_hold"),
                "app_session_authenticated": db.get_kv("app_session_authenticated")}

    @app.post("/api/notifications/read")
    def read_notes():
        with db.tx() as c:
            c.execute("UPDATE notifications SET read=1")
        return {"ok": True}

    @app.get("/api/defaults")
    def defaults():
        return DEFAULT_SETTINGS

    # Serve the built frontend (single-service deploy) if it exists
    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}")
        def spa(path: str):
            f = (dist / path).resolve()
            if path and f.is_file() and dist.resolve() in f.parents:
                return FileResponse(f)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
