from datetime import date, datetime, timezone
from pydantic import BaseModel, Field, field_validator


class VenueSearchCandidate(BaseModel):
    local_venue_id: str | None = None
    name: str
    address: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    timezone: str = "America/New_York"
    website: str | None = None
    external_source: str = "local"
    external_id: str | None = None


class VenueSaveRequest(BaseModel):
    local_venue_id: str | None = None
    name: str = Field(min_length=1, max_length=200)
    address: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    timezone: str = "America/New_York"
    website: str | None = None
    external_source: str = "local"
    external_id: str | None = None

    # Private band-isolated notes
    booking_contact: str | None = None
    load_in_notes: str | None = None
    payout_notes: str | None = None


class VenueOut(BaseModel):
    id: str
    name: str
    address: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    country: str | None
    latitude: float | None
    longitude: float | None
    timezone: str
    website: str | None
    external_source: str

    # Private band-specific notes attached when queried inside a band context
    booking_contact: str | None = None
    load_in_notes: str | None = None
    payout_notes: str | None = None

    model_config = {"from_attributes": True}


class EventCreate(BaseModel):
    event_type: str = Field(default="gig", pattern="^(gig|rehearsal)$")
    title: str = Field(min_length=1, max_length=200)
    status: str = Field(default="confirmed", pattern="^(hold|confirmed|canceled)$")
    venue_id: str | None = None
    setlist_id: str | None = None

    # Naive local wall-clock strings (e.g. "2026-11-21T20:00") + explicit IANA timezone
    local_start: str
    local_end: str | None = None
    timezone: str = "America/New_York"

    load_in_time: str | None = None
    soundcheck_time: str | None = None
    notes: str | None = None


class EventUpdate(BaseModel):
    event_type: str | None = Field(default=None, pattern="^(gig|rehearsal)$")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: str | None = Field(default=None, pattern="^(hold|confirmed|canceled)$")
    venue_id: str | None = None
    setlist_id: str | None = None
    local_start: str | None = None
    local_end: str | None = None
    timezone: str | None = None
    load_in_time: str | None = None
    soundcheck_time: str | None = None
    notes: str | None = None


class EventOut(BaseModel):
    id: str
    band_id: str
    venue_id: str | None
    setlist_id: str | None
    event_type: str
    title: str
    status: str
    start_at_utc: datetime
    end_at_utc: datetime | None
    timezone: str
    load_in_time: str | None
    soundcheck_time: str | None
    notes: str | None

    venue_name: str | None = None
    venue_city: str | None = None
    venue_state: str | None = None
    setlist_name: str | None = None

    model_config = {"from_attributes": True}
    
    @field_validator("start_at_utc", "end_at_utc", mode="before")
    @classmethod
    def ensure_utc_tz(cls, v: datetime | str | None) -> datetime | str | None:
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        if isinstance(v, str) and not v.endswith("Z") and "+" not in v[10:]:
            return f"{v}Z"
        return v


class BlackoutCreate(BaseModel):
    start_date: date
    end_date: date
    reason: str | None = Field(default=None, max_length=255)


class BlackoutOut(BaseModel):
    id: str
    band_id: str
    user_id: str
    user_display_name: str
    start_date: date
    end_date: date
    reason: str | None

    model_config = {"from_attributes": True}