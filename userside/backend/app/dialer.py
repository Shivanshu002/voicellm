"""Background dialer: takes pending contacts of running campaigns and places the calls.

One thread loops every few seconds; each call gets its own thread that blocks on
Asterisk until the call is answered or fails. After an answered call the AGI agent
reports the transcript through /api/internal/... and marks the contact completed.
"""
import json
import logging
import threading
import urllib.request
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update

from . import ami, config
from .db import SessionLocal
from .models import Campaign, Company, Contact, DndNumber

log = logging.getLogger("dialer")
IST = timezone(timedelta(hours=5, minutes=30))
ACTIVE = ("dialing", "in_progress")
# an answered call that never reported back (agent crashed, backend restarted...)
STALE_AFTER = timedelta(minutes=20)

_stop = threading.Event()
_last_error = ""


_warming = threading.Lock()


def status() -> dict:
    return {"enabled": config.DIALER_ENABLED, "dial_mode": config.DIAL_MODE,
            "max_global_calls": config.MAX_GLOBAL_CALLS, "last_error": _last_error}


def _warm_llm():
    if not _warming.acquire(blocking=False):
        return  # already loading
    try:
        body = json.dumps({"model": config.OLLAMA_MODEL, "prompt": "", "keep_alive": -1}).encode()
        req = urllib.request.Request(f"{config.OLLAMA_URL}/api/generate", data=body,
                                     headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=600).read()
        log.info("LLM %s loaded", config.OLLAMA_MODEL)
    except OSError as exc:
        log.error("could not load the LLM: %s", exc)
    finally:
        _warming.release()


def llm_ready() -> bool:
    """True when the agent's model is in RAM. Otherwise starts loading it (a cold load
    from the HDD takes over a minute, and a callee would hear only silence)."""
    global _last_error
    try:
        with urllib.request.urlopen(f"{config.OLLAMA_URL}/api/ps", timeout=3) as resp:
            loaded = [m.get("name", "") for m in json.load(resp).get("models", [])]
    except OSError:
        _last_error = f"AI model server (Ollama) is not running at {config.OLLAMA_URL}"
        return False
    if config.OLLAMA_MODEL in loaded:
        if _last_error.startswith(("Loading", "AI model server")):
            _last_error = ""
        return True
    _last_error = "Loading the AI model, calls will start in a minute"
    threading.Thread(target=_warm_llm, daemon=True).start()
    return False


def in_call_window(company: Company, now: datetime | None = None) -> bool:
    hour = (now or datetime.now(IST)).astimezone(IST).hour
    return company.call_window_start <= hour < company.call_window_end


def _place_call(contact_id: int):
    global _last_error
    with SessionLocal() as db:
        contact = db.get(Contact, contact_id)
        company = db.get(Company, contact.company_id)
        campaign = db.get(Campaign, contact.campaign_id)
        phone, caller_id = contact.phone, f'"{company.name[:30]}" <{contact.campaign_id}>'
        variables = {"VL_CONTACT_ID": contact.id, "VL_DIAL_MODE": config.DIAL_MODE,
                     "VL_CAMPAIGN": campaign.name[:40].replace(",", " ")}
    try:
        outcome, detail = ami.originate(phone, variables, caller_id)
        _last_error = ""
    except ami.AMIError as exc:
        outcome, detail = "failed", str(exc)
        _last_error = str(exc)
        log.error("originate %s: %s", phone, exc)

    with SessionLocal() as db:
        contact = db.get(Contact, contact_id)
        if outcome == "answered":
            # the agent may already have reported "completed"; never step back from it
            if contact.status == "dialing":
                contact.status = "in_progress"
        elif contact.status in ACTIVE:
            contact.status = outcome
            contact.error = detail[:255]
        db.commit()


def recover_after_restart():
    """Calls that were active when the backend stopped can never report back."""
    with SessionLocal() as db:
        db.execute(update(Contact).where(Contact.status.in_(ACTIVE))
                   .values(status="failed", error="interrupted (backend restarted)"))
        db.commit()


def _tick():
    with SessionLocal() as db:
        cutoff = datetime.now(timezone.utc) - STALE_AFTER
        db.execute(update(Contact).where(Contact.status.in_(ACTIVE), Contact.last_attempt_at < cutoff)
                   .values(status="failed", error="no result from the agent"))

        active_total = db.scalar(select(func.count()).select_from(Contact).where(Contact.status.in_(ACTIVE)))
        free = config.MAX_GLOBAL_CALLS - active_total

        running = db.scalars(select(Campaign).where(Campaign.status == "running").order_by(Campaign.id)).all()
        for campaign in running:
            left = db.scalar(select(func.count()).select_from(Contact).where(
                Contact.campaign_id == campaign.id, Contact.status.in_(("pending",) + ACTIVE)))
            if not left:
                campaign.status = "completed"
                continue
            company = db.get(Company, campaign.company_id)
            if free <= 0 or not in_call_window(company):
                continue
            if not llm_ready():
                break
            company_active = db.scalar(select(func.count()).select_from(Contact).where(
                Contact.company_id == company.id, Contact.status.in_(ACTIVE)))
            slots = min(free, company.max_concurrent_calls - company_active)
            if slots <= 0:
                continue
            dnd = set(db.scalars(select(DndNumber.phone).where(DndNumber.company_id == company.id)))
            for contact in db.scalars(select(Contact).where(
                    Contact.campaign_id == campaign.id, Contact.status == "pending")
                    .order_by(Contact.id).limit(slots + 20)).all():
                if slots <= 0:
                    break
                if contact.phone in dnd:
                    contact.status = "skipped_dnd"
                    continue
                contact.status = "dialing"
                contact.attempts += 1
                contact.last_attempt_at = datetime.now(timezone.utc)
                db.commit()
                threading.Thread(target=_place_call, args=(contact.id,), daemon=True).start()
                slots -= 1
                free -= 1
        db.commit()


def _loop():
    while not _stop.is_set():
        try:
            _tick()
        except Exception:
            log.exception("dialer tick failed")
        _stop.wait(3)


def start():
    if not config.DIALER_ENABLED:
        log.info("dialer disabled")
        return
    recover_after_restart()
    _stop.clear()
    threading.Thread(target=_loop, name="dialer", daemon=True).start()


def stop():
    _stop.set()
