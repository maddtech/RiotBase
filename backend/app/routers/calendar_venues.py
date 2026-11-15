from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_band_or_404, get_current_user, require_band_member
from app.models import Band, BandMember, BandVenueNote, Blackout, Event, Setlist, User, Venue
from app.schemas.calendar_venues import (
    BlackoutCreate,
    BlackoutOut,
    EventCreate,
    EventOut,
    EventUpdate,
    VenueOut,
    VenueSaveRequest,
    VenueSearchCandidate,
)
from app.services.venue_lookup import detect_timezone_from_coords, search_venues_cascade

router = APIRouter(prefix="/api/v1/bands/{band_id}", tags=["venues-and-calendar"])


def parse_local_to_utc(local_iso: str, tz_name: str) -> datetime:
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid timezone: {tz_name}")

    try:
        naive = datetime.fromisoformat(local_iso)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid datetime format: {local_iso}")

    if naive.tzinfo is not None:
        return naive.astimezone(timezone.utc)
    return naive.replace(tzinfo=tz).astimezone(timezone.utc)


def serialize_event(ev: Event) -> EventOut:
    out = EventOut.model_validate(ev)
    if ev.venue:
        out.venue_name = ev.venue.name
        out.venue_city = ev.venue.city
        out.venue_state = ev.venue.state
    if ev.setlist:
        out.setlist_name = ev.setlist.name
    return out


# --- VENUES (LOCAL-FIRST + CASCADE) ---

@router.get("/venues/search", response_model=list[VenueSearchCandidate])
async def search_venues(
    q: str = Query(min_length=2),
    membership: BandMember = Depends(require_band_member),
    band: Band = Depends(get_band_or_404),
    db: Session = Depends(get_db),
):
    near_hint = ", ".join(filter(None, [band.home_city, band.home_state])) or None
    return await search_venues_cascade(
        query_text=q,
        db=db,
        default_timezone=band.default_timezone,
        near_hint=near_hint,
    )


@router.get("/venues", response_model=list[VenueOut])
def list_band_venues(
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    # Return venues that this band has private notes for or has played events at
    note_rows = (
        db.query(Venue, BandVenueNote)
        .join(BandVenueNote, BandVenueNote.venue_id == Venue.id)
        .filter(BandVenueNote.band_id == membership.band_id)
        .order_by(Venue.name.asc())
        .all()
    )
    results: list[VenueOut] = []
    seen_ids: set[str] = set()

    for venue, note in note_rows:
        seen_ids.add(venue.id)
        out = VenueOut.model_validate(venue)
        out.booking_contact = note.booking_contact
        out.load_in_notes = note.load_in_notes
        out.payout_notes = note.payout_notes
        results.append(out)

    event_venues = (
        db.query(Venue)
        .join(Event, Event.venue_id == Venue.id)
        .filter(Event.band_id == membership.band_id)
        .all()
    )
    for venue in event_venues:
        if venue.id not in seen_ids:
            seen_ids.add(venue.id)
            results.append(VenueOut.model_validate(venue))

    return sorted(results, key=lambda v: v.name.lower())


@router.post("/venues", response_model=VenueOut, status_code=status.HTTP_201_CREATED)
def save_venue_and_notes(
    payload: VenueSaveRequest,
    membership: BandMember = Depends(require_band_member),
    band: Band = Depends(get_band_or_404),
    db: Session = Depends(get_db),
):
    venue: Venue | None = None
    if payload.local_venue_id:
        venue = db.get(Venue, payload.local_venue_id)
    elif payload.external_id and payload.external_source != "local":
        venue = (
            db.query(Venue)
            .filter(
                Venue.external_source == payload.external_source,
                Venue.external_id == payload.external_id,
            )
            .first()
        )

    if not venue:
        resolved_tz = detect_timezone_from_coords(
            payload.latitude, payload.longitude, payload.timezone or band.default_timezone
        )
        venue = Venue(
            name=payload.name.strip(),
            address=payload.address,
            city=payload.city,
            state=payload.state,
            postal_code=payload.postal_code,
            country=payload.country,
            latitude=payload.latitude,
            longitude=payload.longitude,
            timezone=resolved_tz,
            website=payload.website,
            external_source=payload.external_source,
            external_id=payload.external_id,
        )
        db.add(venue)
        db.flush()

    # Upsert isolated BandVenueNote
    note = (
        db.query(BandVenueNote)
        .filter(BandVenueNote.band_id == membership.band_id, BandVenueNote.venue_id == venue.id)
        .first()
    )
    if not note:
        note = BandVenueNote(band_id=membership.band_id, venue_id=venue.id)
        db.add(note)

    if payload.booking_contact is not None:
        note.booking_contact = payload.booking_contact
    if payload.load_in_notes is not None:
        note.load_in_notes = payload.load_in_notes
    if payload.payout_notes is not None:
        note.payout_notes = payload.payout_notes

    db.commit()
    db.refresh(venue)

    out = VenueOut.model_validate(venue)
    out.booking_contact = note.booking_contact
    out.load_in_notes = note.load_in_notes
    out.payout_notes = note.payout_notes
    return out


# --- GIGS & REHEARSALS (TIMEZONE-AWARE) ---

@router.get("/events", response_model=list[EventOut])
def list_events(
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    events = (
        db.query(Event)
        .options(joinedload(Event.venue), joinedload(Event.setlist))
        .filter(Event.band_id == membership.band_id)
        .order_by(Event.start_at_utc.asc())
        .all()
    )
    return [serialize_event(e) for e in events]


@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    if payload.setlist_id:
        sl = (
            db.query(Setlist.id)
            .filter(Setlist.id == payload.setlist_id, Setlist.band_id == membership.band_id)
            .first()
        )
        if not sl:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid setlist for this band")

    start_utc = parse_local_to_utc(payload.local_start, payload.timezone)
    end_utc = parse_local_to_utc(payload.local_end, payload.timezone) if payload.local_end else None

    event = Event(
        band_id=membership.band_id,
        venue_id=payload.venue_id,
        setlist_id=payload.setlist_id,
        event_type=payload.event_type,
        title=payload.title.strip(),
        status=payload.status,
        start_at_utc=start_utc,
        end_at_utc=end_utc,
        timezone=payload.timezone,
        load_in_time=payload.load_in_time,
        soundcheck_time=payload.soundcheck_time,
        notes=payload.notes,
    )
    db.add(event)
    db.commit()

    saved = (
        db.query(Event)
        .options(joinedload(Event.venue), joinedload(Event.setlist))
        .filter(Event.id == event.id)
        .first()
    )
    return serialize_event(saved)


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: str,
    payload: EventUpdate,
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    event = (
        db.query(Event)
        .options(joinedload(Event.venue), joinedload(Event.setlist))
        .filter(Event.id == event_id, Event.band_id == membership.band_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    tz_to_use = payload.timezone or event.timezone
    if payload.timezone:
        event.timezone = payload.timezone
    if payload.local_start:
        event.start_at_utc = parse_local_to_utc(payload.local_start, tz_to_use)
    if payload.local_end is not None:
        event.end_at_utc = parse_local_to_utc(payload.local_end, tz_to_use) if payload.local_end else None

    provided = payload.model_fields_set
    for field in ["event_type", "title", "status", "venue_id", "setlist_id", "load_in_time", "soundcheck_time", "notes"]:
        if field in provided:
            setattr(event, field, getattr(payload, field))

    db.commit()
    db.refresh(event)
    return serialize_event(event)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: str,
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    event = db.query(Event).filter(Event.id == event_id, Event.band_id == membership.band_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    db.delete(event)
    db.commit()


# --- MEMBER BLACKOUT DATES (PURE CALENDAR DATES) ---

@router.get("/blackouts", response_model=list[BlackoutOut])
def list_blackouts(
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Blackout, User.display_name)
        .join(User, User.id == Blackout.user_id)
        .filter(Blackout.band_id == membership.band_id)
        .order_by(Blackout.start_date.asc())
        .all()
    )
    return [
        BlackoutOut(
            id=b.id,
            band_id=b.band_id,
            user_id=b.user_id,
            user_display_name=display_name,
            start_date=b.start_date,
            end_date=b.end_date,
            reason=b.reason,
        )
        for b, display_name in rows
    ]


@router.post("/blackouts", response_model=BlackoutOut, status_code=status.HTTP_201_CREATED)
def create_blackout(
    payload: BlackoutCreate,
    membership: BandMember = Depends(require_band_member),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date cannot be before start date")

    blackout = Blackout(
        band_id=membership.band_id,
        user_id=current_user.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=payload.reason,
    )
    db.add(blackout)
    db.commit()
    db.refresh(blackout)

    return BlackoutOut(
        id=blackout.id,
        band_id=blackout.band_id,
        user_id=blackout.user_id,
        user_display_name=current_user.display_name,
        start_date=blackout.start_date,
        end_date=blackout.end_date,
        reason=blackout.reason,
    )


@router.delete("/blackouts/{blackout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_blackout(
    blackout_id: str,
    membership: BandMember = Depends(require_band_member),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    blackout = (
        db.query(Blackout)
        .filter(Blackout.id == blackout_id, Blackout.band_id == membership.band_id)
        .first()
    )
    if not blackout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blackout not found")

    if blackout.user_id != current_user.id and membership.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete another member's blackout")

    db.delete(blackout)
    db.commit()