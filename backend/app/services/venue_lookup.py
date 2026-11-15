import httpx
from sqlalchemy.orm import Session
from timezonefinder import TimezoneFinder

from app.config import settings
from app.models import InstanceSettings, Venue

tf = TimezoneFinder()
USER_AGENT = "BandManagerSelfHosted/0.1 (self-hosted band scheduling app)"


def detect_timezone_from_coords(lat: float | None, lon: float | None, fallback: str) -> str:
    if lat is not None and lon is not None:
        tz = tf.timezone_at(lat=lat, lng=lon)
        if tz:
            return tz
    return fallback


async def search_venues_cascade(
    query_text: str,
    db: Session,
    default_timezone: str = "America/New_York",
    near_hint: str | None = None,
) -> list[dict]:
    q = query_text.strip()
    if len(q) < 2:
        return []

    results: list[dict] = []
    seen_keys: set[str] = set()

    # Tier 1: Local DB Cache (Instant & Free)
    local_matches = (
        db.query(Venue)
        .filter(Venue.name.ilike(f"%{q}%"))
        .order_by(Venue.name.asc())
        .limit(8)
        .all()
    )
    for v in local_matches:
        dedupe = f"{v.name.lower()}|{(v.city or '').lower()}"
        seen_keys.add(dedupe)
        results.append(
            {
                "local_venue_id": v.id,
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
                "external_source": "local",
                "external_id": v.external_id,
            }
        )

    # If we already have plenty of local matches, return immediately
    if len(results) >= 5:
        return results

    search_phrase = f"{q} {near_hint}".strip() if near_hint else q

    async with httpx.AsyncClient(timeout=6.0, headers={"User-Agent": USER_AGENT}) as client:
        # Tier 2A: MusicBrainz Place API (Music venues, clubs, halls — zero API key)
        try:
            mb_resp = await client.get(
                "https://musicbrainz.org/ws/2/place",
                params={"query": f'place:"{q}"', "fmt": "json", "limit": 5},
            )
            if mb_resp.status_code == 200:
                for place in mb_resp.json().get("places", []):
                    name = place.get("name")
                    if not name:
                        continue
                    area = place.get("area") or {}
                    city = area.get("name")
                    dedupe = f"{name.lower()}|{(city or '').lower()}"
                    if dedupe in seen_keys:
                        continue
                    seen_keys.add(dedupe)

                    coords = place.get("coordinates") or {}
                    lat = float(coords["latitude"]) if coords.get("latitude") else None
                    lon = float(coords["longitude"]) if coords.get("longitude") else None
                    tz = detect_timezone_from_coords(lat, lon, default_timezone)

                    results.append(
                        {
                            "local_venue_id": None,
                            "name": name,
                            "address": place.get("address") or None,
                            "city": city,
                            "state": None,
                            "postal_code": None,
                            "country": None,
                            "latitude": lat,
                            "longitude": lon,
                            "timezone": tz,
                            "website": None,
                            "external_source": "musicbrainz",
                            "external_id": place.get("id"),
                        }
                    )
        except Exception:
            pass  # External lookup failures must never break local-first workflow

        # Tier 2B: OpenStreetMap Nominatim (Street addresses & coordinates — zero API key)
        try:
            osm_resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": search_phrase,
                    "format": "jsonv2",
                    "addressdetails": 1,
                    "limit": 5,
                },
            )
            if osm_resp.status_code == 200:
                for item in osm_resp.json():
                    addr = item.get("address") or {}
                    name = item.get("name") or addr.get("amenity") or q
                    city = addr.get("city") or addr.get("town") or addr.get("village")
                    state = addr.get("state")
                    dedupe = f"{name.lower()}|{(city or '').lower()}"
                    if dedupe in seen_keys:
                        continue
                    seen_keys.add(dedupe)

                    street = " ".join(filter(None, [addr.get("house_number"), addr.get("road")])).strip() or None
                    lat = float(item["lat"]) if item.get("lat") else None
                    lon = float(item["lon"]) if item.get("lon") else None
                    tz = detect_timezone_from_coords(lat, lon, default_timezone)

                    results.append(
                        {
                            "local_venue_id": None,
                            "name": name,
                            "address": street,
                            "city": city,
                            "state": state,
                            "postal_code": addr.get("postcode"),
                            "country": addr.get("country_code", "").upper() or None,
                            "latitude": lat,
                            "longitude": lon,
                            "timezone": tz,
                            "website": None,
                            "external_source": "osm",
                            "external_id": str(item.get("osm_id")),
                        }
                    )
        except Exception:
            pass

        # Tier 3: Optional BYOK Google Places (Text Search)
        inst = db.get(InstanceSettings, 1)
        google_key = (inst.google_places_api_key if inst else None) or settings.GOOGLE_PLACES_API_KEY
        if google_key:
            try:
                g_resp = await client.post(
                    "https://places.googleapis.com/v1/places:searchText",
                    headers={
                        "X-Goog-Api-Key": google_key,
                        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri",
                    },
                    json={"textQuery": search_phrase, "maxResultCount": 5},
                )
                if g_resp.status_code == 200:
                    for place in g_resp.json().get("places", []):
                        name = (place.get("displayName") or {}).get("text")
                        if not name:
                            continue
                        loc = place.get("location") or {}
                        lat = loc.get("latitude")
                        lon = loc.get("longitude")
                        tz = detect_timezone_from_coords(lat, lon, default_timezone)
                        results.append(
                            {
                                "local_venue_id": None,
                                "name": name,
                                "address": place.get("formattedAddress"),
                                "city": None,
                                "state": None,
                                "postal_code": None,
                                "country": None,
                                "latitude": lat,
                                "longitude": lon,
                                "timezone": tz,
                                "website": place.get("websiteUri"),
                                "external_source": "google",
                                "external_id": place.get("id"),
                            }
                        )
            except Exception:
                pass

    return results[:12]