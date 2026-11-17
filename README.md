# RiotBase: Band Manager (v1.0.0)

A self-hosted, single-container band management web application built for DIY bands. Manage gigs, rehearsals, member availability blackouts, songs, setlists, venue notes, and outbound calendar feeds without relying on third-party SaaS platforms.

---

## Features

- **Multi-Band & Role-Based Access:** Instance-based multi-tenancy with `Admin` and `Member` roles, invite link onboarding, and one-time password reset tokens.
- **Timezone-Aware Gig & Rehearsal Calendar:** Automatically detects venue timezones and displays both venue local time and your personal local time, complete with load-in/soundcheck schedules and inline setlist assignment.
- **Member Availability & Blackout Tracking:** Bandmates can block out unavailable dates, triggering automatic conflict alerts on overlapping gigs or rehearsals.
- **Local-First Venue Directory:** Cascading venue search (Local DB -> MusicBrainz / OpenStreetMap -> optional Google Places BYOK) with private band-only notes for booking contacts, load-in logistics, and payout details.
- **Song Repository & Setlist Builder:** Track originals and covers (BPM, key, tuning, duration, status, lyrics/notes) and assemble ordered setlists with live runtime calculation.
- **Outbound iCal Subscription Feed (`.ics`):** Private, rotatable token-authenticated calendar feeds compatible with Apple Calendar, Google Calendar, and Outlook.
- **Portability & Optional BYOK Integrations:** One-click JSON data export, zero-dependency SQLite WAL storage out of the box (with optional PostgreSQL support), and optional SMTP configuration for email reminders and self-service password resets.

---

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy, Alembic, SQLite (WAL mode) / PostgreSQL
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Lucide Icons
- **Deployment:** Single-container multi-stage Docker image (FastAPI serves both `/api/v1/*` and the compiled SPA)

---

## Quick Start: Docker Compose

### Prerequisites
- Docker Engine and Docker Compose v2+

### Installation
1. **Clone the repository:**
   ```bash
   git clone https://github.com/maddtech/RiotBase.git
   cd RiotBase
   ```

2. **Configure environment variables:**
   Create a `.env` file in the project root with a strong `SECRET_KEY`:
   ```bash
   cat <<EOF > .env
   SECRET_KEY=$(openssl rand -hex 32)
   WORKERS=1
   EOF
   ```
   > **Note:** Keep `WORKERS=1` when using the default SQLite backend. If you configure `DATABASE_URL` for PostgreSQL, you can increase `WORKERS` (e.g., `WORKERS=2`).

3. **Build and start the container:**
   ```bash
   docker compose up -d --build
   ```

4. **Complete initial setup:**
   Open `http://localhost:8000` (or `http://<server-ip>:8000`) in your browser to launch the first-run **Setup Wizard**, create your Instance Admin account, and set up your first band.

---

## Proxmox VE Deployment (Unprivileged Debian 12 LXC)

RiotBase runs cleanly inside a lightweight unprivileged Debian 12 LXC container on Proxmox VE.

### 1. Create the LXC Container (Proxmox Host Shell)
Ensure `nesting=1,keyctl=1` is enabled so Docker can run inside an unprivileged container:

```bash
pct create 115 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname riotbase \
  --cores 2 \
  --memory 1024 \
  --swap 512 \
  --storage local-lvm \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --onboot 1

pct start 115
pct enter 115
```

### 2. Install Docker & Deploy RiotBase (Inside the LXC)
```bash
apt update && apt upgrade -y
apt install -y git curl ca-certificates sqlite3
curl -fsSL https://get.docker.com | sh

git clone --branch v1.0.0 https://github.com/maddtech/RiotBase.git /opt/riotbase
cd /opt/riotbase

cat <<EOF > .env
SECRET_KEY=$(openssl rand -hex 32)
WORKERS=1
EOF

docker compose up -d --build
```

### 3. Updating to Future Releases
Your SQLite database (`/data/app.db`) is persisted in the `band_data` Docker volume, and Alembic runs pending database migrations automatically on container startup:

```bash
cd /opt/riotbase
git fetch --tags
git checkout <new-tag>
docker compose up -d --build
```

---

## Backup & Restore

- **In-App JSON Export:** Navigate to **Sync & Settings -> Download JSON Backup** to export a human-readable snapshot of your band's songs, setlists, events, blackouts, and private venue notes.
- **Automated SQLite Hot Backups (Host Cron):** Use SQLite's online `.backup()` API to safely snapshot the database without stopping the container:
  ```bash
  docker exec band-manager python -c "import sqlite3; src=sqlite3.connect('/data/app.db'); dst=sqlite3.connect('/data/backup.db'); src.backup(dst); dst.close(); src.close()"
  docker cp band-manager:/data/backup.db ./riotbase-$(date +%F).db
  ```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `SECRET_KEY` | **Yes** | — | Secret key used to sign JWT session tokens (`openssl rand -hex 32`). |
| `DATA_DIR` | No | `/data` | Directory where SQLite `app.db` is stored inside the container. |
| `DATABASE_URL` | No | `sqlite:////data/app.db` | SQLAlchemy connection string (supports PostgreSQL). |
| `WORKERS` | No | `1` | Uvicorn worker count (keep `1` for SQLite). |
| `ALLOW_PUBLIC_SIGNUP` | No | `false` | Allow open registration without an invite link (also toggleable in UI). |
| `GOOGLE_PLACES_API_KEY` | No | — | Optional Tier 3 venue search fallback (also configurable in UI). |
| `SMTP_HOST` / `SMTP_PORT` | No | — | Optional SMTP relay for reminders & password resets (also configurable in UI). |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | No | — | Optional SMTP authentication and sender address (also configurable in UI). |

---

## License

MIT
