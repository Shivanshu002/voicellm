"""Called by the Asterisk AGI agent (voicellm/project/agi/voice_agent.py), not by browsers."""
import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import agent_context
from ..db import get_db
from ..deps import internal_only
from ..models import Campaign, Company, Contact, DndNumber
from ..schemas import CallContextOut, CallResultIn

router = APIRouter(prefix="/api/internal", tags=["internal"], dependencies=[Depends(internal_only)])


def _contact(db: Session, contact_id: int) -> Contact:
    contact = db.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown contact")
    return contact


@router.get("/calls/{contact_id}/context", response_model=CallContextOut)
def call_context(contact_id: int, db: Session = Depends(get_db)):
    contact = _contact(db, contact_id)
    company, campaign = db.get(Company, contact.company_id), db.get(Campaign, contact.campaign_id)
    if contact.status in ("dialing", "pending"):
        contact.status = "in_progress"
        db.commit()
    return CallContextOut(
        greeting=agent_context.greeting(company, campaign, contact),
        system_prompt=agent_context.system_prompt(company, campaign, contact),
    )


@router.post("/calls/{contact_id}/result", status_code=204)
def call_result(contact_id: int, body: CallResultIn, db: Session = Depends(get_db)):
    contact = _contact(db, contact_id)
    turns = [{"user": str(t.get("user", ""))[:1000], "agent": str(t.get("agent", ""))[:1000]}
             for t in body.turns][:50]
    contact.transcript = json.dumps(turns, ensure_ascii=False)
    contact.duration_seconds = max(0, body.duration_seconds)
    contact.status = "failed" if body.error else "completed"
    contact.error = body.error[:255]
    db.commit()
    if agent_context.wants_opt_out(turns):
        db.add(DndNumber(company_id=contact.company_id, phone=contact.phone, reason="asked not to be called"))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
