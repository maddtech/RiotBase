import secrets
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from icalendar import Calendar, Event as ICalEvent
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.deps import (
    get_band_or_404,
    get_instance_settings,
    require_band_admin,
    require_band_member,
    require_instance_admin,
)
from app.models import (
    Band,
    BandMember,
    BandVenueNote,
    Blackout,
    Event,
    InstanceSettings,
    PasswordResetToken,
    Setlist,
    SetlistItem,
    Song,
    User,
    Venue,
)
from app.security import generate_one_time_token
from app.services.mailer import get_smtp_config, send_email_if_configured

router = APIRouter(prefix="/api/v1", tags=["ical-backup-and-admin"])


# --- 1. OUTBOUND iCAL SUBSCRIPTION FEED ---

@router.get("/ical/{band_id}/{ical_token}.ics")
def get_band_ical_feed(band_id: str, ical_token: str, db: Session = Depends(get_db)):
    band = db.get(Band, band_id)
    if not band or not secrets.compare_digest(band.ical_token, ical_token):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar feed not found")

    cal = Calendar()
    cal.add("prodid", "-//Band Manager//Self-Hosted Band Calendar//EN")
    cal.add("version", "2.0")
    cal.add("x-wr-calname", f"{band.name} — Gigs & Rehearsals")
    cal.add("x-wr-timezone", band.default_timezone)

    events = (
        db.query(Event)
        .options(joinedload(Event.venue), joinedload(Event.setlist))
        .filter(Event.band_id == band.id, Event.status != "canceled")
        .order_by(Event.start_at_utc.asc())
        .all()
    )

    for ev in events:
        vevent = ICalEvent()
        vevent.add("uid", f"event-{ev.id}@band-manager")
        prefix = "[HOLD] " if ev.status == "hold" else ""
        vevent.add("summary", f"{prefix}{ev.title} ({ev.event_type.title()})")

        start_dt = ev.start_at_utc.replace(tzinfo=timezone.utc) if ev.start_at_utc.tzinfo is None else ev.start_at_utc
        end_dt = (
            (ev.end_at_utc.replace(tzinfo=timezone.utc) if ev.end_at_utc.tzinfo is None else ev.end_at_utc)
            if ev.end_at_utc
            else start_dt + timedelta(hours=3 if ev.event_type == "gig" else 2)
        )
        vevent.add("dtstart", start_dt)
        vevent.add("dtend", end_dt)
        vevent.add("dtstamp", datetime.now(timezone.utc))

        desc_lines = []
        if ev.load_in_time:
            desc_lines.append(f"Load-in: {ev.load_in_time}")
        if ev.soundcheck_time:
            desc_lines.append(f"Soundcheck: {ev.soundcheck_time}")
        if ev.setlist:
            desc_lines.append(f"Setlist: {ev.setlist.name}")
        if ev.notes:
            desc_lines.append(f"\n{ev.notes}")
        if desc_lines:
            vevent.add("description", "\n".join(desc_lines))

        if ev.venue:
            loc_parts = [ev.venue.name, ev.venue.address, ev.venue.city, ev.venue.state]
            vevent.add("location", ", ".join(filter(None, loc_parts)))

        cal.add_component(vevent)

    return Response(
        content=cal.to_ical(),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'inline; filename="{band.slug}.ics"'},
    )


@router.post("/bands/{band_id}/ical/rotate")
def rotate_band_ical_token(
    membership: BandMember = Depends(require_band_admin),
    band: Band = Depends(get_band_or_404),
    db: Session = Depends(get_db),
):
    band.ical_token = secrets.token_urlsafe(32)
    db.commit()
    return {"ical_token": band.ical_token}


# --- 2. ONE-CLICK BAND JSON BACKUP EXPORT ---

@router.get("/bands/{band_id}/export")
def export_band_backup(
    membership: BandMember = Depends(require_band_member),
    band: Band = Depends(get_band_or_404),
    db: Session = Depends(get_db),
):
    songs = db.query(Song).filter(Song.band_id == band.id).all()
    setlists = (
        db.query(Setlist)
        .options(joinedload(Setlist.items))
        .filter(Setlist.band_id == band.id)
        .all()
    )
    events = (
        db.query(Event)
        .options(joinedload(Event.venue))
        .filter(Event.band_id == band.id)
        .all()
    )
    blackouts = db.query(Blackout).filter(Blackout.band_id == band.id).all()
    venue_notes = (
        db.query(Venue, BandVenueNote)
        .join(BandVenueNote, BandVenueNote.venue_id == Venue.id)
        .filter(BandVenueNote.band_id == band.id)
        .all()
    )

    payload = {
        "exported_at_utc": datetime.now(timezone.utc).isoformat(),
        "band": {
            "id": band.id,
            "name": band.name,
            "slug": band.slug,
            "home_city": band.home_city,
            "home_state": band.home_state,
            "default_timezone": band.default_timezone,
        },
        "songs": [
            {
                "id": s.id,
                "title": s.title,
                "artist": s.artist,
                "is_cover": s.is_cover,
                "bpm": s.bpm,
                "musical_key": s.musical_key,
                "tuning": s.tuning,
                "duration_seconds": s.duration_seconds,
                "status": s.status,
                "lyrics_or_notes": s.lyrics_or_notes,
            }
            for s in songs
        ],
        "setlists": [
            {
                "id": sl.id,
                "name": sl.name,
                "notes": sl.notes,
                "items": [
                    {
                        "position": item.position,
                        "item_type": item.item_type,
                        "song_id": item.song_id,
                        "custom_label": item.custom_label,
                        "custom_duration_seconds": item.custom_duration_seconds,
                    }
                    for item in sl.items
                ],
            }
            for sl in setlists
        ],
        "venues": [
            {
                "id": v.id,
                "name": v.name,
                "address": v.address,
                "city": v.city,
                "state": v.state,
                "timezone": v.timezone,
                "website": v.website,
                "booking_contact": note.booking_contact,
                "load_in_notes": note.load_in_notes,
                "payout_notes": note.payout_notes,
            }
            for v, note in venue_notes
        ],
        "events": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "title": e.title,
                "status": e.status,
                "start_at_utc": e.start_at_utc.isoformat(),
                "end_at_utc": e.end_at_utc.isoformat() if e.end_at_utc else None,
                "timezone": e.timezone,
                "venue_name": e.venue.name if e.venue else None,
                "load_in_time": e.load_in_time,
                "soundcheck_time": e.soundcheck_time,
                "notes": e.notes,
            }
            for e in events
        ],
        "blackouts": [
            {
                "id": b.id,
                "user_id": b.user_id,
                "start_date": b.start_date.isoformat(),
                "end_date": b.end_date.isoformat(),
                "reason": b.reason,
            }
            for b in blackouts
        ],
    }
    return payload


# --- 3. OPTIONAL BYOK SMTP: EVENT REMINDERS & SELF-SERVICE RESET ---

@router.post("/bands/{band_id}/events/{event_id}/notify")
def send_event_notification(
    event_id: str,
    membership: BandMember = Depends(require_band_member),
    band: Band = Depends(get_band_or_404),
    db: Session = Depends(get_db),
):
    if not get_smtp_config(db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SMTP is not configured on this server. Configure SMTP in Instance Settings first.",
        )

    event = (
        db.query(Event)
        .options(joinedload(Event.venue), joinedload(Event.setlist))
        .filter(Event.id == event_id, Event.band_id == band.id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    member_emails = [
        email
        for (email,) in db.query(User.email)
        .join(BandMember, BandMember.user_id == User.id)
        .filter(BandMember.band_id == band.id)
        .all()
    ]

    local_dt = event.start_at_utc.astimezone(ZoneInfo(event.timezone))
    when_str = local_dt.strftime("%a, %b %d, %Y at %I:%M %p %Z")
    where_str = f"{event.venue.name} ({event.venue.city or ''})" if event.venue else "TBD"

    body = (
        f"Band: {band.name}\n"
        f"Event: {event.title} ({event.event_type.upper()} - {event.status.upper()})\n"
        f"When: {when_str}\n"
        f"Where: {where_str}\n"
        f"Load-in: {event.load_in_time or '—'}\n"
        f"Soundcheck: {event.soundcheck_time or '—'}\n"
        f"Setlist: {event.setlist.name if event.setlist else '—'}\n\n"
        f"{event.notes or ''}"
    )

    sent = send_email_if_configured(
        db,
        to_addresses=member_emails,
        subject=f"[{band.name}] {event.event_type.title()}: {event.title} ({local_dt.strftime('%b %d')})",
        body=body,
    )
    if not sent:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to send email via SMTP")

    return {"sent_to_count": len(member_emails)}


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


@router.post("/auth/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset_email(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    # Always return 202 so attackers cannot enumerate registered emails
    if not get_smtp_config(db):
        return {"detail": "If SMTP is configured and the account exists, a reset email was sent."}

    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if user:
        raw_token, token_hash = generate_one_time_token()
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
            )
        )
        db.commit()
        reset_url = f"{str(request.base_url).rstrip('/')}/reset-password/{raw_token}"
        send_email_if_configured(
            db,
            to_addresses=[user.email],
            subject="Password Reset Request",
            body=f"Use this one-time link within 2 hours to reset your password:\n\n{reset_url}",
        )

    return {"detail": "If SMTP is configured and the account exists, a reset email was sent."}


# --- 4. INSTANCE ADMIN BYOK SETTINGS ---

class InstanceSettingsOut(BaseModel):
    allow_public_signup: bool
    has_google_places_key: bool
    smtp_host: str | None
    smtp_port: int | None
    smtp_user: str | None
    has_smtp_pass: bool
    smtp_from: str | None


class InstanceSettingsUpdate(BaseModel):
    allow_public_signup: bool | None = None
    google_places_api_key: str | None = None  # Pass "" to clear
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_pass: str | None = None  # Pass "" to clear; omit/None to keep existing
    smtp_from: str | None = None


@router.get("/admin/settings", response_model=InstanceSettingsOut)
def get_admin_settings(
    admin: User = Depends(require_instance_admin),
    inst: InstanceSettings = Depends(get_instance_settings),
):
    return InstanceSettingsOut(
        allow_public_signup=inst.allow_public_signup or settings.ALLOW_PUBLIC_SIGNUP,
        has_google_places_key=bool(inst.google_places_api_key or settings.GOOGLE_PLACES_API_KEY),
        smtp_host=inst.smtp_host or settings.SMTP_HOST,
        smtp_port=inst.smtp_port or settings.SMTP_PORT,
        smtp_user=inst.smtp_user or settings.SMTP_USER,
        has_smtp_pass=bool(inst.smtp_pass or settings.SMTP_PASS),
        smtp_from=inst.smtp_from or settings.SMTP_FROM,
    )


@router.patch("/admin/settings", response_model=InstanceSettingsOut)
def update_admin_settings(
    payload: InstanceSettingsUpdate,
    admin: User = Depends(require_instance_admin),
    inst: InstanceSettings = Depends(get_instance_settings),
    db: Session = Depends(get_db),
):
    if payload.allow_public_signup is not None:
        inst.allow_public_signup = payload.allow_public_signup
    if payload.google_places_api_key is not None:
        inst.google_places_api_key = payload.google_places_api_key.strip() or None
    if payload.smtp_host is not None:
        inst.smtp_host = payload.smtp_host.strip() or None
    if payload.smtp_port is not None:
        inst.smtp_port = payload.smtp_port
    if payload.smtp_user is not None:
        inst.smtp_user = payload.smtp_user.strip() or None
    if payload.smtp_pass is not None:
        inst.smtp_pass = payload.smtp_pass.strip() or None
    if payload.smtp_from is not None:
        inst.smtp_from = payload.smtp_from.strip() or None

    db.commit()
    db.refresh(inst)
    return get_admin_settings(admin=admin, inst=inst)


@router.post("/admin/settings/test-smtp")
def send_test_smtp(
    admin: User = Depends(require_instance_admin),
    db: Session = Depends(get_db),
):
    ok = send_email_if_configured(
        db,
        to_addresses=[admin.email],
        subject="Band Manager — SMTP Test Successful",
        body="Your self-hosted Band Manager instance successfully connected to your SMTP server.",
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SMTP test failed. Verify host, port, credentials, and sender address.",
        )
    return {"status": "sent"}