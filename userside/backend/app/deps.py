import hmac

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .models import User
from .security import decode_token


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, please log in again")
    user = db.get(User, int(payload["sub"]))
    if not user or user.company_id != payload.get("cid"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    return user


def internal_only(x_internal_token: str = Header(default="")):
    """For the Asterisk agent only (shared secret, never sent to browsers)."""
    if not hmac.compare_digest(x_internal_token, config.INTERNAL_TOKEN):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
