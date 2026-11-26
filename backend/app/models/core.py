import secrets
import uuid
from datetime import date, datetime, timezone
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    preferred_timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_instance_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    memberships: Mapped[list["BandMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class InstanceSettings(Base):
    __tablename__ = "instance_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    allow_public_signup: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    google_places_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    smtp_user: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_pass: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_from: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Band(Base):
    __tablename__ = "bands"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    home_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    home_state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    default_timezone: Mapped[str] = mapped_column(String(64), default="America/New_York", nullable=False)
    ical_token: Mapped[str] = mapped_column(
        String(64), unique=True, default=lambda: secrets.token_urlsafe(32), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    members: Mapped[list["BandMember"]] = relationship(back_populates="band", cascade="all, delete-orphan")
    events: Mapped[list["Event"]] = relationship(back_populates="band", cascade="all, delete-orphan")
    blackouts: Mapped[list["Blackout"]] = relationship(back_populates="band", cascade="all, delete-orphan")
    songs: Mapped[list["Song"]] = relationship(back_populates="band", cascade="all, delete-orphan")
    setlists: Mapped[list["Setlist"]] = relationship(back_populates="band", cascade="all, delete-orphan")


class BandMember(Base):
    __tablename__ = "band_members"
    __table_args__ = (UniqueConstraint("band_id", "user_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    band_id: Mapped[str] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="member", nullable=False)  # "admin" | "member"
    instrument_role: Mapped[str | None] = mapped_column(String(80), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    band: Mapped["Band"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships")


class BandInvite(Base):
    __tablename__ = "band_invites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    band_id: Mapped[str] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), index=True, nullable=False)
    token: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, default=lambda: secrets.token_urlsafe(24), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), default="member", nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    use_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Venue(Base):
    __tablename__ = "venues"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), default="America/New_York", nullable=False)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_source: Mapped[str] = mapped_column(String(32), default="local", nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class BandVenueNote(Base):
    __tablename__ = "band_venue_notes"
    __table_args__ = (UniqueConstraint("band_id", "venue_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    band_id: Mapped[str] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), index=True, nullable=False)
    venue_id: Mapped[str] = mapped_column(ForeignKey("venues.id", ondelete="CASCADE"), index=True, nullable=False)
    booking_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    load_in_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    payout_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    band_id: Mapped[str] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), index=True, nullable=False)
    venue_id: Mapped[str | None] = mapped_column(ForeignKey("venues.id", ondelete="SET NULL"), nullable=True)
    setlist_id: Mapped[str | None] = mapped_column(ForeignKey("setlists.id", ondelete="SET NULL"), nullable=True)

    event_type: Mapped[str] = mapped_column(String(20), default="gig", nullable=False)  # "gig" | "rehearsal"
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="confirmed", nullable=False)  # "hold" | "confirmed" | "canceled"

    start_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    end_at_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), default="America/New_York", nullable=False)

    load_in_time: Mapped[str | None] = mapped_column(String(20), nullable=True)
    soundcheck_time: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    flyer_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    flyer_content_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    band: Mapped["Band"] = relationship(back_populates="events")
    venue: Mapped["Venue | None"] = relationship()
    setlist: Mapped["Setlist | None"] = relationship()


class Blackout(Base):
    __tablename__ = "blackouts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    band_id: Mapped[str] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    band: Mapped["Band"] = relationship(back_populates="blackouts")
    user: Mapped["User"] = relationship()


class Song(Base):
    __tablename__ = "songs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    band_id: Mapped[str] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    artist: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_cover: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    bpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    musical_key: Mapped[str | None] = mapped_column(String(20), nullable=True)
    tuning: Mapped[str | None] = mapped_column(String(32), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=180, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ready", nullable=False)  # "ready" | "learning" | "retired"
    lyrics_or_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    band: Mapped["Band"] = relationship(back_populates="songs")


class Setlist(Base):
    __tablename__ = "setlists"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    band_id: Mapped[str] = mapped_column(ForeignKey("bands.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    band: Mapped["Band"] = relationship(back_populates="setlists")
    items: Mapped[list["SetlistItem"]] = relationship(
        back_populates="setlist", order_by="SetlistItem.position", cascade="all, delete-orphan"
    )


class SetlistItem(Base):
    __tablename__ = "setlist_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    setlist_id: Mapped[str] = mapped_column(ForeignKey("setlists.id", ondelete="CASCADE"), index=True, nullable=False)
    song_id: Mapped[str | None] = mapped_column(ForeignKey("songs.id", ondelete="SET NULL"), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    item_type: Mapped[str] = mapped_column(String(20), default="song", nullable=False)  # "song" | "break" | "note"
    custom_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    custom_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    setlist: Mapped["Setlist"] = relationship(back_populates="items")
    song: Mapped["Song | None"] = relationship()