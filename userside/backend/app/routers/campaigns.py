import json

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .. import dialer
from ..db import get_db
from ..deps import current_user
from ..importer import read_contacts
from ..models import Campaign, Company, Contact, User
from ..phones import normalize
from ..schemas import CampaignIn, CampaignOut, CampaignUpdate, ContactIn, ContactOut, ImportResult

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


def _own(db: Session, user: User, campaign_id: int) -> Campaign:
    campaign = db.get(Campaign, campaign_id)
    if not campaign or campaign.company_id != user.company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    return campaign


def _out(db: Session, campaign: Campaign) -> CampaignOut:
    rows = db.execute(select(Contact.status, func.count()).where(Contact.campaign_id == campaign.id)
                      .group_by(Contact.status)).all()
    out = CampaignOut.model_validate(campaign)
    out.counts = {s: n for s, n in rows}
    out.notice = _notice(db, campaign)
    return out


def _notice(db: Session, campaign: Campaign) -> str:
    """Why a running campaign is not calling right now, in words for the user."""
    if campaign.status != "running":
        return ""
    company = db.get(Company, campaign.company_id)
    if not dialer.in_call_window(company):
        return (f"Outside your calling hours ({company.call_window_start}:00–{company.call_window_end}:00 IST). "
                f"Calls will start at {company.call_window_start}:00, or change the hours in Settings.")
    return dialer.status()["last_error"]


def _contact_out(c: Contact) -> ContactOut:
    return ContactOut(id=c.id, phone=c.phone, name=c.name, status=c.status, attempts=c.attempts,
                      duration_seconds=c.duration_seconds, error=c.error,
                      transcript=json.loads(c.transcript or "[]"), updated_at=c.updated_at)


def _add_contacts(db: Session, campaign: Campaign, rows: list[tuple[object, str]]) -> ImportResult:
    existing = set(db.scalars(select(Contact.phone).where(Contact.campaign_id == campaign.id)))
    added = duplicates = invalid = 0
    invalid_samples = []
    for raw, name in rows:
        phone = normalize(raw)
        if not phone:
            invalid += 1
            if len(invalid_samples) < 5:
                invalid_samples.append(str(raw))
            continue
        if phone in existing:
            duplicates += 1
            continue
        existing.add(phone)
        db.add(Contact(campaign_id=campaign.id, company_id=campaign.company_id, phone=phone, name=name))
        added += 1
    if added and campaign.status == "completed":
        campaign.status = "paused"  # new numbers: let the user start it again
    db.commit()
    return ImportResult(added=added, duplicates=duplicates, invalid=invalid, invalid_samples=invalid_samples)


@router.get("", response_model=list[CampaignOut])
def list_campaigns(user: User = Depends(current_user), db: Session = Depends(get_db)):
    campaigns = db.scalars(select(Campaign).where(Campaign.company_id == user.company_id)
                           .order_by(Campaign.id.desc())).all()
    return [_out(db, c) for c in campaigns]


@router.post("", response_model=CampaignOut, status_code=201)
def create_campaign(body: CampaignIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    campaign = Campaign(company_id=user.company_id, **body.model_dump())
    db.add(campaign)
    db.commit()
    return _out(db, campaign)


@router.get("/{campaign_id}", response_model=CampaignOut)
def get_campaign(campaign_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _out(db, _own(db, user, campaign_id))


@router.patch("/{campaign_id}", response_model=CampaignOut)
def update_campaign(campaign_id: int, body: CampaignUpdate, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    campaign = _own(db, user, campaign_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(campaign, field, value)
    db.commit()
    return _out(db, campaign)


@router.delete("/{campaign_id}", status_code=204)
def delete_campaign(campaign_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    campaign = _own(db, user, campaign_id)
    if db.scalar(select(func.count()).select_from(Contact).where(
            Contact.campaign_id == campaign.id, Contact.status.in_(("dialing", "in_progress")))):
        raise HTTPException(status.HTTP_409_CONFLICT, "A call is in progress; pause and wait for it to end")
    db.delete(campaign)
    db.commit()


@router.post("/{campaign_id}/start", response_model=CampaignOut)
def start_campaign(campaign_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    campaign = _own(db, user, campaign_id)
    pending = db.scalar(select(func.count()).select_from(Contact).where(
        Contact.campaign_id == campaign.id, Contact.status == "pending"))
    if not pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "No numbers left to call - add some first")
    campaign.status = "running"
    db.commit()
    return _out(db, campaign)


@router.post("/{campaign_id}/pause", response_model=CampaignOut)
def pause_campaign(campaign_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    campaign = _own(db, user, campaign_id)
    if campaign.status == "running":
        campaign.status = "paused"  # calls already ringing finish normally
        db.commit()
    return _out(db, campaign)


@router.post("/{campaign_id}/retry", response_model=CampaignOut)
def retry_failed(campaign_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Put unanswered / busy / failed numbers back in the queue."""
    campaign = _own(db, user, campaign_id)
    for c in db.scalars(select(Contact).where(Contact.campaign_id == campaign.id,
                                              Contact.status.in_(("no_answer", "busy", "failed")))):
        c.status, c.error = "pending", ""
    if campaign.status == "completed":
        campaign.status = "paused"
    db.commit()
    return _out(db, campaign)


@router.get("/{campaign_id}/contacts", response_model=list[ContactOut])
def list_contacts(campaign_id: int, status_filter: str | None = Query(default=None, alias="status"),
                  limit: int = Query(default=500, le=5000), offset: int = 0,
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    _own(db, user, campaign_id)
    q = select(Contact).where(Contact.campaign_id == campaign_id)
    if status_filter:
        q = q.where(Contact.status == status_filter)
    return [_contact_out(c) for c in db.scalars(q.order_by(Contact.id).limit(limit).offset(offset))]


@router.post("/{campaign_id}/contacts", response_model=ImportResult)
def add_contacts(campaign_id: int, body: ContactIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    campaign = _own(db, user, campaign_id)
    rows = []
    for line in body.phones.splitlines():
        if line.strip():
            phone, _, name = line.partition(",")
            rows.append((phone.strip(), name.strip()[:120]))
    return _add_contacts(db, campaign, rows)


@router.post("/{campaign_id}/upload", response_model=ImportResult)
async def upload_contacts(campaign_id: int, file: UploadFile = File(...), user: User = Depends(current_user),
                          db: Session = Depends(get_db)):
    campaign = _own(db, user, campaign_id)
    name = (file.filename or "").lower()
    if not name.endswith((".xlsx", ".csv")):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Upload an .xlsx or .csv file")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is larger than 5 MB")
    try:
        rows = read_contacts(name, data)
    except Exception as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Could not read the file: {exc}")
    return _add_contacts(db, campaign, rows)


@router.delete("/{campaign_id}/contacts/{contact_id}", status_code=204)
def delete_contact(campaign_id: int, contact_id: int, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    _own(db, user, campaign_id)
    contact = db.get(Contact, contact_id)
    if not contact or contact.campaign_id != campaign_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if contact.status in ("dialing", "in_progress"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This number is being called right now")
    db.delete(contact)
    db.commit()


@router.delete("/{campaign_id}/contacts", status_code=204)
def clear_pending(campaign_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Remove every number that has not been called yet."""
    _own(db, user, campaign_id)
    db.execute(delete(Contact).where(Contact.campaign_id == campaign_id, Contact.status == "pending"))
    db.commit()
