from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now():
    return datetime.now(timezone.utc)


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    # facts the agent may use when it talks (hours, prices, policies...)
    business_info: Mapped[str] = mapped_column(Text, default="")
    max_concurrent_calls: Mapped[int] = mapped_column(Integer, default=1)
    # local (IST) hours in which calls may be placed
    call_window_start: Mapped[int] = mapped_column(Integer, default=9)
    call_window_end: Mapped[int] = mapped_column(Integer, default=21)
    created_at: Mapped[datetime] = mapped_column(default=now)

    users: Mapped[list["User"]] = relationship(back_populates="company")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(default=now)

    company: Mapped[Company] = relationship(back_populates="users")


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    # first thing the agent says; {name} is replaced with the contact's name
    opening_message: Mapped[str] = mapped_column(Text, default="")
    # what the call is for, e.g. "remind about the EMI due on the 5th"
    instructions: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|running|paused|completed
    created_at: Mapped[datetime] = mapped_column(default=now)

    contacts: Mapped[list["Contact"]] = relationship(back_populates="campaign", cascade="all, delete-orphan")


# pending -> dialing -> in_progress -> completed
#                    \-> no_answer | busy | failed
# pending -> skipped_dnd
CONTACT_STATUSES = ("pending", "dialing", "in_progress", "completed", "no_answer", "busy", "failed", "skipped_dnd")


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("campaign_id", "phone"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    phone: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    transcript: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of {user, agent}
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str] = mapped_column(String(255), default="")
    last_attempt_at: Mapped[datetime | None] = mapped_column(default=None)
    updated_at: Mapped[datetime] = mapped_column(default=now, onupdate=now)

    campaign: Mapped[Campaign] = relationship(back_populates="contacts")


class DndNumber(Base):
    """Numbers a company must never call (opt-outs)."""

    __tablename__ = "dnd_numbers"
    __table_args__ = (UniqueConstraint("company_id", "phone"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    phone: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(default=now)
