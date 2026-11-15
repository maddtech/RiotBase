from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import require_band_member
from app.models import BandMember, Setlist, SetlistItem, Song
from app.schemas.songs_setlists import (
    SetlistCreate,
    SetlistItemInput,
    SetlistOut,
    SetlistUpdate,
    SongCreate,
    SongOut,
    SongUpdate,
)

router = APIRouter(prefix="/api/v1/bands/{band_id}", tags=["songs-and-setlists"])


def serialize_setlist(setlist: Setlist) -> SetlistOut:
    total_seconds = 0
    song_count = 0
    for item in setlist.items:
        if item.item_type == "song" and item.song:
            song_count += 1
            total_seconds += (
                item.custom_duration_seconds
                if item.custom_duration_seconds is not None
                else item.song.duration_seconds
            )
        elif item.custom_duration_seconds:
            total_seconds += item.custom_duration_seconds

    out = SetlistOut.model_validate(setlist)
    out.total_duration_seconds = total_seconds
    out.song_count = song_count
    return out


# --- SONG REPOSITORY ---

@router.get("/songs", response_model=list[SongOut])
def list_songs(
    q: str | None = Query(default=None),
    song_status: str | None = Query(default=None, alias="status"),
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    query = db.query(Song).filter(Song.band_id == membership.band_id)
    if song_status:
        query = query.filter(Song.status == song_status)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.filter((Song.title.ilike(pattern)) | (Song.artist.ilike(pattern)))
    return query.order_by(Song.title.asc()).all()


@router.post("/songs", response_model=SongOut, status_code=status.HTTP_201_CREATED)
def create_song(
    payload: SongCreate,
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    song = Song(band_id=membership.band_id, **payload.model_dump())
    db.add(song)
    db.commit()
    db.refresh(song)
    return song


@router.patch("/songs/{song_id}", response_model=SongOut)
def update_song(
    song_id: str,
    payload: SongUpdate,
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    song = db.query(Song).filter(Song.id == song_id, Song.band_id == membership.band_id).first()
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(song, field, value)

    db.commit()
    db.refresh(song)
    return song


@router.delete("/songs/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_song(
    song_id: str,
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    song = db.query(Song).filter(Song.id == song_id, Song.band_id == membership.band_id).first()
    if not song:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    db.delete(song)
    db.commit()


# --- SETLIST BUILDER ---

@router.get("/setlists", response_model=list[SetlistOut])
def list_setlists(
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    setlists = (
        db.query(Setlist)
        .options(joinedload(Setlist.items).joinedload(SetlistItem.song))
        .filter(Setlist.band_id == membership.band_id)
        .order_by(Setlist.created_at.desc())
        .all()
    )
    return [serialize_setlist(s) for s in setlists]


@router.post("/setlists", response_model=SetlistOut, status_code=status.HTTP_201_CREATED)
def create_setlist(
    payload: SetlistCreate,
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    setlist = Setlist(band_id=membership.band_id, name=payload.name.strip(), notes=payload.notes)
    db.add(setlist)
    db.commit()
    db.refresh(setlist)
    return serialize_setlist(setlist)


@router.get("/setlists/{setlist_id}", response_model=SetlistOut)
def get_setlist(
    setlist_id: str,
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    setlist = (
        db.query(Setlist)
        .options(joinedload(Setlist.items).joinedload(SetlistItem.song))
        .filter(Setlist.id == setlist_id, Setlist.band_id == membership.band_id)
        .first()
    )
    if not setlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setlist not found")
    return serialize_setlist(setlist)


@router.patch("/setlists/{setlist_id}", response_model=SetlistOut)
def update_setlist(
    setlist_id: str,
    payload: SetlistUpdate,
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    setlist = (
        db.query(Setlist)
        .options(joinedload(Setlist.items).joinedload(SetlistItem.song))
        .filter(Setlist.id == setlist_id, Setlist.band_id == membership.band_id)
        .first()
    )
    if not setlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setlist not found")

    if payload.name is not None:
        setlist.name = payload.name.strip()
    if payload.notes is not None:
        setlist.notes = payload.notes

    db.commit()
    db.refresh(setlist)
    return serialize_setlist(setlist)


@router.put("/setlists/{setlist_id}/items", response_model=SetlistOut)
def replace_setlist_items(
    setlist_id: str,
    items: list[SetlistItemInput],
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    setlist = (
        db.query(Setlist)
        .filter(Setlist.id == setlist_id, Setlist.band_id == membership.band_id)
        .first()
    )
    if not setlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setlist not found")

    # Verify all referenced song_ids belong to this band
    song_ids = {item.song_id for item in items if item.song_id}
    if song_ids:
        valid_count = (
            db.query(Song.id)
            .filter(Song.band_id == membership.band_id, Song.id.in_(song_ids))
            .count()
        )
        if valid_count != len(song_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more songs do not belong to this band",
            )

    # Clear and rewrite ordered items cleanly
    db.query(SetlistItem).filter(SetlistItem.setlist_id == setlist.id).delete()
    for idx, item in enumerate(items):
        db.add(
            SetlistItem(
                setlist_id=setlist.id,
                song_id=item.song_id if item.item_type == "song" else None,
                position=idx,
                item_type=item.item_type,
                custom_label=item.custom_label,
                custom_duration_seconds=item.custom_duration_seconds,
            )
        )

    db.commit()
    refreshed = (
        db.query(Setlist)
        .options(joinedload(Setlist.items).joinedload(SetlistItem.song))
        .filter(Setlist.id == setlist.id)
        .first()
    )
    return serialize_setlist(refreshed)


@router.delete("/setlists/{setlist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_setlist(
    setlist_id: str,
    membership: BandMember = Depends(require_band_member),
    db: Session = Depends(get_db),
):
    setlist = (
        db.query(Setlist)
        .filter(Setlist.id == setlist_id, Setlist.band_id == membership.band_id)
        .first()
    )
    if not setlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setlist not found")
    db.delete(setlist)
    db.commit()