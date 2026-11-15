from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import auth, bands, calendar_venues, songs_setlists, utilities_admin

app = FastAPI(title=settings.APP_NAME, version="0.1.0")

app.include_router(auth.router)
app.include_router(bands.router)
app.include_router(songs_setlists.router)
app.include_router(calendar_venues.router)
app.include_router(utilities_admin.router)

@app.get("/api/v1/health")
def health_check():
    return {"status": "ok"}


# Serve compiled Vite frontend if present (in Docker/LXC production builds)
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if STATIC_DIR.exists():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        candidate = STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")