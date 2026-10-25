import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _email(v: str) -> str:
    v = v.strip().lower()
    if not _EMAIL.match(v):
        raise ValueError("Enter a valid email")
    return v


class RegisterIn(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=120)
    email: str
    password: str = Field(min_length=8, max_length=128)

    _check_email = field_validator("email")(_email)


class LoginIn(BaseModel):
    email: str
    password: str

    _check_email = field_validator("email")(_email)


class CompanyOut(BaseModel):
    id: int
    name: str
    business_info: str
    max_concurrent_calls: int
    call_window_start: int
    call_window_end: int

    model_config = {"from_attributes": True}


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    business_info: str | None = Field(default=None, max_length=8000)
    max_concurrent_calls: int | None = Field(default=None, ge=1, le=20)
    call_window_start: int | None = Field(default=None, ge=0, le=23)
    call_window_end: int | None = Field(default=None, ge=1, le=24)


class UserOut(BaseModel):
    id: int
    name: str
    email: str

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    token: str
    user: UserOut
    company: CompanyOut


class CampaignIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    opening_message: str = Field(default="", max_length=500)
    instructions: str = Field(default="", max_length=4000)


class CampaignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    opening_message: str | None = Field(default=None, max_length=500)
    instructions: str | None = Field(default=None, max_length=4000)


class CampaignOut(BaseModel):
    id: int
    name: str
    opening_message: str
    instructions: str
    status: str
    created_at: datetime
    counts: dict[str, int] = {}
    notice: str = ""  # why a running campaign is not calling right now

    model_config = {"from_attributes": True}


class ContactIn(BaseModel):
    phones: str = Field(description="one number per line, optionally 'number, name'", max_length=200_000)


class ContactOut(BaseModel):
    id: int
    phone: str
    name: str
    status: str
    attempts: int
    duration_seconds: int
    error: str
    transcript: list[dict]
    updated_at: datetime


class ImportResult(BaseModel):
    added: int
    duplicates: int
    invalid: int
    invalid_samples: list[str]


class DndIn(BaseModel):
    phone: str
    reason: str = Field(default="added manually", max_length=120)


class DndOut(BaseModel):
    id: int
    phone: str
    reason: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CallContextOut(BaseModel):
    greeting: str
    system_prompt: str


class CallResultIn(BaseModel):
    turns: list[dict] = []
    duration_seconds: int = 0
    error: str = ""
