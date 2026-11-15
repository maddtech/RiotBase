from datetime import datetime
from pydantic import BaseModel, Field


class SongCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    artist: str | None = Field(default=None, max_length=200)
    is_cover: bool = False
    bpm: int | None = Field(default=None, ge=20, le=400)
    musical_key: str | None = Field(default=None, max_length=20)
    tuning: str | None = Field(default=None, max_length=32)
    duration_seconds: int = Field(default=180, ge=1, le=3600)
    status: str = Field(default="ready", pattern="^(ready|learning|retired)$")
    lyrics_or_notes: str | None = None


class SongUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    artist: str | None = Field(default=None, max_length=200)
    is_cover: bool | None = None
    bpm: int | None = Field(default=None, ge=20, le=400)
    musical_key: str | None = Field(default=None, max_length=20)
    tuning: str | None = Field(default=None, max_length=32)
    duration_seconds: int | None = Field(default=None, ge=1, le=3600)
    status: str | None = Field(default=None, pattern="^(ready|learning|retired)$")
    lyrics_or_notes: str | None = None


class SongOut(BaseModel):
    id: str
    band_id: str
    title: str
    artist: str | None
    is_cover: bool
    bpm: int | None
    musical_key: str | None
    tuning: str | None
    duration_seconds: int
    status: str
    lyrics_or_notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SetlistItemInput(BaseModel):
    song_id: str | None = None
    item_type: str = Field(default="song", pattern="^(song|break|note)$")
    custom_label: str | None = Field(default=None, max_length=200)
    custom_duration_seconds: int | None = Field(default=None, ge=0, le=3600)


class SetlistItemOut(BaseModel):
    id: str
    position: int
    item_type: str
    song_id: str | None
    custom_label: str | None
    custom_duration_seconds: int | None
    song: SongOut | None = None

    model_config = {"from_attributes": True}


class SetlistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    notes: str | None = None


class SetlistUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    notes: str | None = None


class SetlistOut(BaseModel):
    id: str
    band_id: str
    name: str
    notes: str | None
    created_at: datetime
    total_duration_seconds: int = 0
    song_count: int = 0
    items: list[SetlistItemOut] = []

    model_config = {"from_attributes": True}