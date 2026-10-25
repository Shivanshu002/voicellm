from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import dialer
from ..db import get_db
from ..deps import current_user
from ..models import Campaign, Company, Contact, DndNumber, User
from ..phones import normalize
from ..schemas import CompanyOut, CompanyUpdate, DndIn, DndOut

router = APIRouter(prefix="/api/company", tags=["company"])


@router.get("", response_model=CompanyOut)
def get_company(user: User = Depends(current_user)):
    return user.company


@router.patch("", response_model=CompanyOut)
def update_company(body: CompanyUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    company = db.get(Company, user.company_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(company, field, value.strip() if isinstance(value, str) else value)
    if company.call_window_start >= company.call_window_end:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Calling hours: start must be before end")
    db.commit()
    return company


@router.get("/stats")
def stats(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Contact.status, func.count()).where(Contact.company_id == user.company_id)
                      .group_by(Contact.status)).all()
    by_status = {s: n for s, n in rows}
    talk = db.scalar(select(func.coalesce(func.sum(Contact.duration_seconds), 0))
                     .where(Contact.company_id == user.company_id))
    campaigns = db.scalar(select(func.count()).select_from(Campaign).where(Campaign.company_id == user.company_id))
    running = db.scalar(select(func.count()).select_from(Campaign).where(
        Campaign.company_id == user.company_id, Campaign.status == "running"))
    return {
        "campaigns": campaigns,
        "running_campaigns": running,
        "contacts": sum(by_status.values()),
        "by_status": by_status,
        "talk_seconds": talk,
        "in_call_window": dialer.in_call_window(user.company),
        "dialer": dialer.status(),
    }


@router.get("/dnd", response_model=list[DndOut])
def list_dnd(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(DndNumber).where(DndNumber.company_id == user.company_id)
                      .order_by(DndNumber.id.desc())).all()


@router.post("/dnd", response_model=DndOut, status_code=201)
def add_dnd(body: DndIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    phone = normalize(body.phone)
    if not phone:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Not a valid phone number")
    row = DndNumber(company_id=user.company_id, phone=phone, reason=body.reason)
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Number is already on the do-not-call list")
    return row


@router.delete("/dnd/{dnd_id}", status_code=204)
def delete_dnd(dnd_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.get(DndNumber, dnd_id)
    if not row or row.company_id != user.company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    db.delete(row)
    db.commit()
