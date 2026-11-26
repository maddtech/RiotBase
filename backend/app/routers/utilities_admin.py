import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from icalendar import Calendar, Event as ICalEvent
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
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
        .options(joinedload(Event.venue), joinedload(Event.setlist))
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
                "postal_code": v.postal_code,
                "country": v.country,
                "latitude": v.latitude,
                "longitude": v.longitude,
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
                "venue_id": e.venue_id,
                "venue_name": e.venue.name if e.venue else None,
                "setlist_id": e.setlist_id,
                "setlist_name": e.setlist.name if e.setlist else None,
                "load_in_time": e.load_in_time,
                "soundcheck_time": e.soundcheck_time,
                "notes": e.notes,
                "flyer_filename": e.flyer_filename,
                "flyer_content_type": e.flyer_content_type,
                "flyer_path": f"uploads/flyers/{band.id}/{e.flyer_filename}" if e.flyer_filename else None,
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


# --- 2b. BAND JSON BACKUP IMPORT (BAND ADMINS ONLY) ---

class BandImportRequest(BaseModel):
    mode: Literal["merge", "replace"] = "merge"
    update_band_profile: bool = False
    data: dict[str, Any]


def _clean_str(value: Any, max_len: int | None = None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_len] if max_len else text


def _normalize_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_utc_datetime(value: Any, field_name: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or missing datetime for {field_name}",
        )
    raw = value.strip()
    if raw.endswith("Z"):
        raw = f"{raw[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ISO datetime format for {field_name}: {value}",
        )
    return _normalize_utc(parsed)


def _parse_iso_date(value: Any, field_name: str) -> date:
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or missing date for {field_name}",
        )
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ISO date format for {field_name}: {value}",
        )


def _safe_timezone(value: Any, fallback: str) -> str:
    tz_str = _clean_str(value, 64)
    if not tz_str:
        return fallback
    try:
        ZoneInfo(tz_str)
        return tz_str
    except ZoneInfoNotFoundError:
        return fallback


def _allocate_id(model_cls: Any, incoming_id: Any, db: Session, allocated: set[str]) -> str:
    candidate = _clean_str(incoming_id, 36)
    if candidate and candidate not in allocated and db.get(model_cls, candidate) is None:
        allocated.add(candidate)
        return candidate
    generated = str(uuid.uuid4())
    allocated.add(generated)
    return generated


@router.post("/bands/{band_id}/import")
def import_band_backup(
    payload: BandImportRequest,
    membership: BandMember = Depends(require_band_admin),
    band: Band = Depends(get_band_or_404),
    db: Session = Depends(get_db),
):
    data = payload.data
    sections = ("songs", "setlists", "venues", "events", "blackouts")
    if not any(isinstance(data.get(sec), list) for sec in sections):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Backup payload must include at least one list section (songs, setlists, venues, events, or blackouts).",
        )
    for sec in sections:
        val = data.get(sec)
        if val is not None and not isinstance(val, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Section '{sec}' must be a list.",
            )

    try:
        # Optional band profile update (city, state, default_timezone only)
        if payload.update_band_profile and isinstance(data.get("band"), dict):
            band_data = data["band"]
            if "home_city" in band_data:
                band.home_city = _clean_str(band_data.get("home_city"), 100)
            if "home_state" in band_data:
                band.home_state = _clean_str(band_data.get("home_state"), 100)
            if band_data.get("default_timezone"):
                tz_candidate = _clean_str(band_data.get("default_timezone"), 64)
                if tz_candidate:
                    try:
                        ZoneInfo(tz_candidate)
                    except ZoneInfoNotFoundError:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid band default_timezone: {tz_candidate}",
                        )
                    band.default_timezone = tz_candidate

        # Wipe existing band-scoped records in replace mode
        if payload.mode == "replace":
            db.query(Event).filter(Event.band_id == band.id).delete(synchronize_session=False)
            setlist_ids = [
                sl_id for (sl_id,) in db.query(Setlist.id).filter(Setlist.band_id == band.id).all()
            ]
            if setlist_ids:
                db.query(SetlistItem).filter(SetlistItem.setlist_id.in_(setlist_ids)).delete(
                    synchronize_session=False
                )
            db.query(Setlist).filter(Setlist.band_id == band.id).delete(synchronize_session=False)
            db.query(Song).filter(Song.band_id == band.id).delete(synchronize_session=False)
            db.query(Blackout).filter(Blackout.band_id == band.id).delete(synchronize_session=False)
            db.query(BandVenueNote).filter(BandVenueNote.band_id == band.id).delete(synchronize_session=False)
            db.flush()

        # Preload existing band-scoped records for merge upserts
        existing_songs = db.query(Song).filter(Song.band_id == band.id).all()
        songs_by_id = {s.id: s for s in existing_songs}
        songs_by_key = {(s.title.strip().lower(), (s.artist or "").strip().lower()): s for s in existing_songs}

        existing_setlists = db.query(Setlist).filter(Setlist.band_id == band.id).all()
        setlists_by_id = {sl.id: sl for sl in existing_setlists}
        setlists_by_name = {sl.name.strip().lower(): sl for sl in existing_setlists}

        existing_events = db.query(Event).filter(Event.band_id == band.id).all()
        events_by_id = {e.id: e for e in existing_events}
        events_by_key = {(e.title.strip().lower(), _normalize_utc(e.start_at_utc)): e for e in existing_events}

        existing_blackouts = db.query(Blackout).filter(Blackout.band_id == band.id).all()
        blackouts_by_id = {b.id: b for b in existing_blackouts}
        blackouts_by_key = {(b.user_id, b.start_date, b.end_date): b for b in existing_blackouts}

        existing_notes = db.query(BandVenueNote).filter(BandVenueNote.band_id == band.id).all()
        notes_by_venue_id = {n.venue_id: n for n in existing_notes}

        # 1. Venues & private BandVenueNotes
        venue_id_map: dict[str, str] = {}
        venue_name_map: dict[str, str] = {}
        allocated_venue_ids: set[str] = set()
        venues_count = 0

        for v_in in data.get("venues") or []:
            if not isinstance(v_in, dict):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each venue entry must be an object.")
            v_name = _clean_str(v_in.get("name"), 200)
            if not v_name:
                continue

            incoming_id = _clean_str(v_in.get("id"), 36)
            v_city = _clean_str(v_in.get("city"), 100)
            v_state = _clean_str(v_in.get("state"), 100)

            venue: Venue | None = db.get(Venue, incoming_id) if incoming_id else None
            if not venue:
                q = db.query(Venue).filter(func.lower(Venue.name) == v_name.lower())
                if v_city:
                    q = q.filter(func.lower(Venue.city) == v_city.lower())
                else:
                    q = q.filter(Venue.city.is_(None))
                if v_state:
                    q = q.filter(func.lower(Venue.state) == v_state.lower())
                else:
                    q = q.filter(Venue.state.is_(None))
                venue = q.first()

            if not venue:
                venue = Venue(
                    id=_allocate_id(Venue, incoming_id, db, allocated_venue_ids),
                    name=v_name,
                    address=_clean_str(v_in.get("address"), 255),
                    city=v_city,
                    state=v_state,
                    postal_code=_clean_str(v_in.get("postal_code"), 30),
                    country=_clean_str(v_in.get("country"), 80),
                    latitude=float(v_in["latitude"]) if v_in.get("latitude") is not None else None,
                    longitude=float(v_in["longitude"]) if v_in.get("longitude") is not None else None,
                    timezone=_safe_timezone(v_in.get("timezone"), band.default_timezone),
                    website=_clean_str(v_in.get("website"), 255),
                    external_source="local",
                )
                db.add(venue)
                db.flush()

            note = notes_by_venue_id.get(venue.id)
            if not note:
                note = BandVenueNote(band_id=band.id, venue_id=venue.id)
                db.add(note)
                notes_by_venue_id[venue.id] = note

            note.booking_contact = _clean_str(v_in.get("booking_contact"), 255)
            note.load_in_notes = _clean_str(v_in.get("load_in_notes"))
            note.payout_notes = _clean_str(v_in.get("payout_notes"))

            if incoming_id:
                venue_id_map[incoming_id] = venue.id
            venue_name_map[v_name.lower()] = venue.id
            venues_count += 1

        # 2. Songs
        song_id_map: dict[str, str] = {}
        allocated_song_ids: set[str] = set()
        songs_count = 0

        for s_in in data.get("songs") or []:
            if not isinstance(s_in, dict):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each song entry must be an object.")
            title = _clean_str(s_in.get("title"), 200)
            if not title:
                continue

            incoming_id = _clean_str(s_in.get("id"), 36)
            artist = _clean_str(s_in.get("artist"), 200)
            key = (title.lower(), (artist or "").lower())

            song = songs_by_id.get(incoming_id) if incoming_id else None
            if not song and payload.mode == "merge":
                song = songs_by_key.get(key)

            raw_status = s_in.get("status")
            song_status = raw_status if raw_status in {"ready", "learning", "retired"} else "ready"
            raw_dur = s_in.get("duration_seconds")
            duration_seconds = int(raw_dur) if isinstance(raw_dur, (int, float)) and raw_dur >= 1 else 180
            raw_bpm = s_in.get("bpm")
            bpm = int(raw_bpm) if isinstance(raw_bpm, (int, float)) and 20 <= raw_bpm <= 400 else None

            if song:
                song.title = title
                song.artist = artist
                song.is_cover = bool(s_in.get("is_cover", False))
                song.bpm = bpm
                song.musical_key = _clean_str(s_in.get("musical_key"), 20)
                song.tuning = _clean_str(s_in.get("tuning"), 32)
                song.duration_seconds = min(duration_seconds, 3600)
                song.status = song_status
                song.lyrics_or_notes = _clean_str(s_in.get("lyrics_or_notes"))
            else:
                song = Song(
                    id=_allocate_id(Song, incoming_id, db, allocated_song_ids),
                    band_id=band.id,
                    title=title,
                    artist=artist,
                    is_cover=bool(s_in.get("is_cover", False)),
                    bpm=bpm,
                    musical_key=_clean_str(s_in.get("musical_key"), 20),
                    tuning=_clean_str(s_in.get("tuning"), 32),
                    duration_seconds=min(duration_seconds, 3600),
                    status=song_status,
                    lyrics_or_notes=_clean_str(s_in.get("lyrics_or_notes")),
                )
                db.add(song)
                db.flush()
                songs_by_id[song.id] = song

            songs_by_key[key] = song
            if incoming_id:
                song_id_map[incoming_id] = song.id
            songs_count += 1

        valid_band_song_ids = set(songs_by_id.keys())

        # 3. Setlists & SetlistItems
        setlist_id_map: dict[str, str] = {}
        setlist_name_map: dict[str, str] = {name: sl.id for name, sl in setlists_by_name.items()}
        allocated_setlist_ids: set[str] = set()
        setlists_count = 0

        for sl_in in data.get("setlists") or []:
            if not isinstance(sl_in, dict):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each setlist entry must be an object.")
            sl_name = _clean_str(sl_in.get("name"), 150)
            if not sl_name:
                continue

            incoming_id = _clean_str(sl_in.get("id"), 36)
            setlist = setlists_by_id.get(incoming_id) if incoming_id else None
            if not setlist and payload.mode == "merge":
                setlist = setlists_by_name.get(sl_name.lower())

            if setlist:
                setlist.name = sl_name
                setlist.notes = _clean_str(sl_in.get("notes"))
                db.query(SetlistItem).filter(SetlistItem.setlist_id == setlist.id).delete(
                    synchronize_session=False
                )
                db.flush()
            else:
                setlist = Setlist(
                    id=_allocate_id(Setlist, incoming_id, db, allocated_setlist_ids),
                    band_id=band.id,
                    name=sl_name,
                    notes=_clean_str(sl_in.get("notes")),
                )
                db.add(setlist)
                db.flush()
                setlists_by_id[setlist.id] = setlist

            raw_items = sl_in.get("items") or []
            if not isinstance(raw_items, list):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Setlist 'items' must be a list.")

            indexed_items = list(enumerate(raw_items))
            indexed_items.sort(
                key=lambda pair: pair[1].get("position", pair[0])
                if isinstance(pair[1], dict) and isinstance(pair[1].get("position"), int)
                else pair[0]
            )

            for pos, (_, item_in) in enumerate(indexed_items):
                if not isinstance(item_in, dict):
                    continue
                raw_type = item_in.get("item_type")
                item_type = raw_type if raw_type in {"song", "break", "note"} else "song"
                resolved_song_id: str | None = None
                if item_type == "song":
                    raw_sid = _clean_str(item_in.get("song_id"), 36)
                    if raw_sid:
                        candidate_sid = song_id_map.get(raw_sid, raw_sid)
                        if candidate_sid in valid_band_song_ids:
                            resolved_song_id = candidate_sid

                raw_custom_dur = item_in.get("custom_duration_seconds")
                custom_dur = (
                    min(int(raw_custom_dur), 3600)
                    if isinstance(raw_custom_dur, (int, float)) and raw_custom_dur >= 0
                    else None
                )
                db.add(
                    SetlistItem(
                        setlist_id=setlist.id,
                        song_id=resolved_song_id,
                        position=pos,
                        item_type=item_type,
                        custom_label=_clean_str(item_in.get("custom_label"), 200),
                        custom_duration_seconds=custom_dur,
                    )
                )

            setlists_by_name[sl_name.lower()] = setlist
            setlist_name_map[sl_name.lower()] = setlist.id
            if incoming_id:
                setlist_id_map[incoming_id] = setlist.id
            setlists_count += 1

        valid_band_setlist_ids = set(setlists_by_id.keys())

        # 4. Events
        allocated_event_ids: set[str] = set()
        events_count = 0

        for e_in in data.get("events") or []:
            if not isinstance(e_in, dict):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each event entry must be an object.")
            title = _clean_str(e_in.get("title"), 200)
            if not title:
                continue

            incoming_id = _clean_str(e_in.get("id"), 36)
            start_utc = _parse_utc_datetime(e_in.get("start_at_utc"), "events.start_at_utc")
            end_utc = (
                _parse_utc_datetime(e_in.get("end_at_utc"), "events.end_at_utc")
                if e_in.get("end_at_utc")
                else None
            )

            # Resolve optional venue reference by venue_id or venue_name
            resolved_venue_id: str | None = None
            raw_vid = _clean_str(e_in.get("venue_id"), 36)
            if raw_vid:
                mapped_vid = venue_id_map.get(raw_vid, raw_vid)
                if db.get(Venue, mapped_vid) is not None:
                    resolved_venue_id = mapped_vid
            if not resolved_venue_id:
                v_name = _clean_str(e_in.get("venue_name"), 200)
                if v_name:
                    resolved_venue_id = venue_name_map.get(v_name.lower())
                    if not resolved_venue_id:
                        found_v = db.query(Venue).filter(func.lower(Venue.name) == v_name.lower()).first()
                        if found_v:
                            resolved_venue_id = found_v.id
                            venue_name_map[v_name.lower()] = found_v.id

            # Resolve optional setlist reference by setlist_id or setlist_name
            resolved_setlist_id: str | None = None
            raw_slid = _clean_str(e_in.get("setlist_id"), 36)
            if raw_slid:
                mapped_slid = setlist_id_map.get(raw_slid, raw_slid)
                if mapped_slid in valid_band_setlist_ids:
                    resolved_setlist_id = mapped_slid
            if not resolved_setlist_id:
                sl_name = _clean_str(e_in.get("setlist_name"), 150)
                if sl_name:
                    resolved_setlist_id = setlist_name_map.get(sl_name.lower())

            ev_type = e_in.get("event_type") if e_in.get("event_type") in {"gig", "rehearsal"} else "gig"
            ev_status = e_in.get("status") if e_in.get("status") in {"hold", "confirmed", "canceled"} else "confirmed"
            ev_tz = _safe_timezone(e_in.get("timezone"), band.default_timezone)

            raw_flyer_fn = _clean_str(e_in.get("flyer_filename"), 255)
            safe_flyer_fn: str | None = None
            if raw_flyer_fn:
                candidate_fn = Path(raw_flyer_fn).name
                if candidate_fn == raw_flyer_fn and Path(candidate_fn).suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                    safe_flyer_fn = candidate_fn
            raw_flyer_ct = _clean_str(e_in.get("flyer_content_type"), 64)
            safe_flyer_ct = (
                raw_flyer_ct
                if safe_flyer_fn and raw_flyer_ct in {"image/jpeg", "image/png", "image/webp"}
                else None
            )

            ev_key = (title.lower(), start_utc)
            event = events_by_id.get(incoming_id) if incoming_id else None
            if not event and payload.mode == "merge":
                event = events_by_key.get(ev_key)

            if event:
                event.event_type = ev_type
                event.title = title
                event.status = ev_status
                event.start_at_utc = start_utc
                event.end_at_utc = end_utc
                event.timezone = ev_tz
                event.venue_id = resolved_venue_id
                event.setlist_id = resolved_setlist_id
                event.load_in_time = _clean_str(e_in.get("load_in_time"), 20)
                event.soundcheck_time = _clean_str(e_in.get("soundcheck_time"), 20)
                event.notes = _clean_str(e_in.get("notes"))
                if "flyer_filename" in e_in:
                    event.flyer_filename = safe_flyer_fn
                    event.flyer_content_type = safe_flyer_ct
            else:
                event = Event(
                    id=_allocate_id(Event, incoming_id, db, allocated_event_ids),
                    band_id=band.id,
                    venue_id=resolved_venue_id,
                    setlist_id=resolved_setlist_id,
                    event_type=ev_type,
                    title=title,
                    status=ev_status,
                    start_at_utc=start_utc,
                    end_at_utc=end_utc,
                    timezone=ev_tz,
                    load_in_time=_clean_str(e_in.get("load_in_time"), 20),
                    soundcheck_time=_clean_str(e_in.get("soundcheck_time"), 20),
                    notes=_clean_str(e_in.get("notes")),
                    flyer_filename=safe_flyer_fn,
                    flyer_content_type=safe_flyer_ct,
                )
                db.add(event)
                db.flush()
                events_by_id[event.id] = event

            events_by_key[ev_key] = event
            events_count += 1

        # 5. Member Blackouts (skip any blackout whose user_id is not a member of this band)
        band_member_user_ids = {
            uid for (uid,) in db.query(BandMember.user_id).filter(BandMember.band_id == band.id).all()
        }
        allocated_blackout_ids: set[str] = set()
        blackouts_count = 0
        skipped_blackouts = 0

        for b_in in data.get("blackouts") or []:
            if not isinstance(b_in, dict):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Each blackout entry must be an object.",
                )
            uid = _clean_str(b_in.get("user_id"), 36)
            if not uid or uid not in band_member_user_ids:
                skipped_blackouts += 1
                continue

            start_d = _parse_iso_date(b_in.get("start_date"), "blackouts.start_date")
            end_d = _parse_iso_date(b_in.get("end_date") or b_in.get("start_date"), "blackouts.end_date")
            if end_d < start_d:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Blackout end_date cannot be before start_date.",
                )

            incoming_id = _clean_str(b_in.get("id"), 36)
            b_key = (uid, start_d, end_d)
            blackout = blackouts_by_id.get(incoming_id) if incoming_id else None
            if not blackout and payload.mode == "merge":
                blackout = blackouts_by_key.get(b_key)

            if blackout:
                blackout.user_id = uid
                blackout.start_date = start_d
                blackout.end_date = end_d
                blackout.reason = _clean_str(b_in.get("reason"), 255)
            else:
                blackout = Blackout(
                    id=_allocate_id(Blackout, incoming_id, db, allocated_blackout_ids),
                    band_id=band.id,
                    user_id=uid,
                    start_date=start_d,
                    end_date=end_d,
                    reason=_clean_str(b_in.get("reason"), 255),
                )
                db.add(blackout)
                db.flush()
                blackouts_by_id[blackout.id] = blackout

            blackouts_by_key[b_key] = blackout
            blackouts_count += 1

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to import backup: {exc}",
        )

    return {
        "status": "ok",
        "mode": payload.mode,
        "counts": {
            "songs": songs_count,
            "setlists": setlists_count,
            "venues": venues_count,
            "events": events_count,
            "blackouts": blackouts_count,
            "skipped_blackouts": skipped_blackouts,
        },
    }


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