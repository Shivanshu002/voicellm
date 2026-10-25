from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import Company, User
from ..schemas import CompanyOut, LoginIn, RegisterIn, SessionOut, UserOut
from ..security import create_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _session(user: User) -> SessionOut:
    return SessionOut(
        token=create_token(user.id, user.company_id),
        user=UserOut.model_validate(user),
        company=CompanyOut.model_validate(user.company),
    )


@router.post("/register", response_model=SessionOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """A new company and its first (admin) user."""
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    company = Company(name=body.company_name.strip())
    user = User(company=company, name=body.name.strip(), email=body.email,
                password_hash=hash_password(body.password))
    db.add_all([company, user])
    db.commit()
    return _session(user)


@router.post("/login", response_model=SessionOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    return _session(user)


@router.get("/me", response_model=SessionOut)
def me(user: User = Depends(current_user)):
    return _session(user)
