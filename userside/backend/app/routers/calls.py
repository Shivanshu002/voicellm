"""Call history across all of a company's campaigns."""
import csv
import io
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..dialer import IST
from ..models import Campaign, Contact, User
from .campaigns import _own

router = APIRouter(prefix="/api", tags=["calls"])

CALLED = ("in_progress", "completed", "no_answer", "busy", "failed")
NOT_REACHED = ("no_answer", "busy", "failed")


@router.get("/calls")
def list_calls(q: str = "", status: str = "", campaign_id: int | None = None,
               limit: int = Query(default=50, le=200), offset: int = 0,
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Numbers that have been called, newest first."""
    query = (select(Contact, Campaign.name).join(Campaign, Campaign.id == Contact.campaign_id)
             .where(Contact.company_id == user.company_id, Contact.status.in_(CALLED)))
    if status:
        query = query.where(Contact.status.in_(NOT_REACHED) if status == "not_reached" else Contact.status == status)
    if campaign_id:
        query = query.where(Contact.campaign_id == campaign_id)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(Contact.phone.like(like), Contact.name.like(like), Contact.transcript.like(like)))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(query.order_by(Contact.last_attempt_at.desc(), Contact.id.desc())
                      .limit(limit).offset(offset)).all()
    return {
        "total": total,
        "items": [{
            "id": c.id, "campaign_id": c.campaign_id, "campaign_name": name, "phone": c.phone, "name": c.name,
            "status": c.status, "duration_seconds": c.duration_seconds, "error": c.error,
            "attempts": c.attempts, "transcript": json.loads(c.transcript or "[]"),
            "called_at": c.last_attempt_at, "updated_at": c.updated_at,
        } for c, name in rows],
    }


@router.get("/company/activity")
def activity(days: int = Query(default=14, ge=1, le=90), user: User = Depends(current_user),
             db: Session = Depends(get_db)):
    """Calls per IST day: answered vs not reached, oldest first, every day present."""
    today = datetime.now(IST).date()
    start = today - timedelta(days=days - 1)
    since = datetime.combine(start, datetime.min.time(), tzinfo=IST).astimezone(timezone.utc)
    rows = db.execute(select(Contact.status, Contact.last_attempt_at).where(
        Contact.company_id == user.company_id, Contact.status.in_(CALLED),
        Contact.last_attempt_at >= since.replace(tzinfo=None))).all()
    buckets = {start + timedelta(days=i): {"answered": 0, "not_reached": 0} for i in range(days)}
    for status, at in rows:
        if at is None:
            continue
        day = at.replace(tzinfo=timezone.utc).astimezone(IST).date()
        if day in buckets:
            buckets[day]["not_reached" if status in NOT_REACHED else "answered"] += 1
    return [{"date": d.isoformat(), **v} for d, v in buckets.items()]


@router.get("/campaigns/{campaign_id}/export.csv")
def export_csv(campaign_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    campaign = _own(db, user, campaign_id)
    buf = io.StringIO()
    buf.write("﻿")  # BOM: Excel then reads Hindi/UTF-8 correctly
    w = csv.writer(buf)
    w.writerow(["phone", "name", "status", "attempts", "duration_seconds", "called_at_ist", "conversation", "error"])
    for c in db.scalars(select(Contact).where(Contact.campaign_id == campaign.id).order_by(Contact.id)):
        turns = json.loads(c.transcript or "[]")
        convo = " | ".join(f"Customer: {t['user']} / Agent: {t['agent']}" for t in turns)
        called = (c.last_attempt_at.replace(tzinfo=timezone.utc).astimezone(IST).strftime("%Y-%m-%d %H:%M")
                  if c.last_attempt_at else "")
        w.writerow([c.phone, c.name, c.status, c.attempts, c.duration_seconds, called, convo, c.error])
    safe = "".join(ch if ch.isalnum() else "_" for ch in campaign.name)[:40] or "campaign"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{safe}_results.csv"'})
