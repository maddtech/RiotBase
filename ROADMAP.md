# RiotBase: Band Manager — Product & Architecture Roadmap

This document tracks planned releases, optional feature modules, and infrastructure improvements for **RiotBase** (`maddtech/RiotBase`).

All releases preserve backward compatibility with existing SQLite (`/data/app.db`) and PostgreSQL deployments via additive Alembic migrations and single-container Docker builds.

---

## Released

### v1.0.0 — Core Band Operations
- Multi-band & role-based access (`Admin` / `Member`), invite onboarding, and one-time password resets
- Timezone-aware gig & rehearsal calendar with load-in/soundcheck schedules and member blackout conflict alerts
- Cascading venue lookup (Local DB -> MusicBrainz / OpenStreetMap -> optional Google Places BYOK) with private band notes
- Song repository & ordered setlist builder with runtime calculation
- Outbound rotatable `.ics` iCal subscription feeds and optional BYOK SMTP reminders

### v1.0.1 — Band Data Portability
- JSON backup import endpoint (`POST /api/v1/bands/{band_id}/import`) with Merge/Upsert and Replace modes
- Pre-import JSON file parser and record-count preview UI in Settings

---

## Planned Milestones

### v1.1.0 — Core UX Polish & Module Foundation *(Next)*
Establishes the plugin-style module toggle system alongside high-value gig preparation enhancements:
- **Event Flyer Attachments:** Upload, preview, and download show flyers (`JPG`, `PNG`, `WebP`) on Event records, persisted in `/data/uploads/flyers/{band_id}/` and referenced in JSON backups.
- **Band Module Toggle Framework:**
  - `enabled_modules` JSON column on `Band` with Band Admin toggle controls in **Settings** (`PATCH /api/v1/bands/{band_id}/modules`).
  - `require_module("<key>")` FastAPI dependency guard and React `MODULE_REGISTRY` lazy-loaded navigation.
  - Non-destructive toggles: disabling a module hides UI routes and blocks API endpoints without deleting underlying database rows.

### v1.2.0 — Module 1: Band Fund & Member Reimbursement Ledger
Optional financial tracking (`ledger` module) isolated under `app/modules/ledger/`:
- **Shared Band Fund Ledger:** Track door guarantees, merch cuts, rehearsal space rent, promo costs, and member cash contributions using integer-cent precision.
- **Out-of-Pocket Member Reimbursements:** Log expenses paid personally by bandmates, calculate per-member owed balances automatically, and record "Settle Up / Reimburse" payouts.
- **Event Linking:** Optionally attach ledger entries to specific `Event` records (`ondelete="SET NULL"`) to see net profit/loss per show.
- **Backup Integration:** Include `ledger_entries` in JSON export/import snapshots.

### v1.3.0 — Module 2: Merch Inventory & Show Sales
Optional inventory and show-night tallying (`merch` module) isolated under `app/modules/merch/`:
- **Catalog & Variant Tracking:** Manage shirts, vinyl/CDs/tapes, patches, and stickers with per-size/variant stock counts, unit cost, and sale price.
- **Show Night Tally Mode:** Fast mobile-friendly counter to log items sold at a gig and decrement inventory automatically.
- **Optional Ledger Sync:** When the `ledger` module is also enabled, optionally post net show merch revenue directly into the Band Fund.

### v1.4.0 — Module 3: DIY Rolodex & Scene Networking
Optional booking, contact, and regional scene discovery tools (`rolodex` module) isolated under `app/modules/rolodex/`:
- **Band Contact Rolodex:** Private directory for promoters, talent buyers, sound engineers, photographers, press, and sister bands tagged by city, state, and genre.
- **Regional Scene & Bill-Building Finder:** Filter contacts and local bands by city/market to assemble multi-band bills when routing out-of-town shows.
- **Outreach Tracker:** Track booking pitch status (`Not Contacted`, `Reached Out`, `Follow Up`, `Confirmed`) linked to target cities or venues.

### v1.5.0 — Module 4: Short Tour Planner & Day Sheets
Optional multi-day run organization (`tour` module) aggregating existing `Event`, `Venue`, `Setlist`, and `Rolodex` data:
- **Tour Run Grouping:** Group consecutive gig `Event` records into a named weekend or regional tour run with mileage/drive-time estimates and lodging notes.
- **Printable & Mobile Day Sheets:** Auto-generate clean daily itineraries combining venue address, load-in/soundcheck/set times, assigned setlist, promoter contact info, and payout terms.

---

## Infrastructure & Repository Backlog

- **Instance Admin Settings Backup/Restore:** Export and restore `InstanceSettings` (SMTP and BYOK API keys) separately from band-level backups.
- **Reverse Proxy & HTTPS Deployment Docs:** Add tested Caddyfile and Nginx Proxy Manager examples to `README.md` for external iCal feed syncing over HTTPS.
- **Automated Backup Script (`scripts/backup.sh`):** Bundle SQLite `.backup()` hot snapshots and `/data/uploads/` archival into a single cron-friendly host script.
- **Screenshots & Demo Media:** Add UI screenshots (`docs/screenshots/`) to `README.md`.
- **Proxmox LXC SSH Key & Hardening:** Configure dedicated Ed25519 SSH keys and disable password authentication on the production LXC host.

---

## Architectural Guardrails for Modules

1. **Upfront Additive Migrations:** All module tables are created via standard Alembic migrations regardless of whether a module is currently enabled.
2. **One-Way Dependencies:** Optional modules (`app/modules/<name>/`) may reference core models (`Band`, `User`, `Event`), but core models must never depend on optional module tables.
3. **Safe Deletion Cascades:** Foreign keys from modules to `events` or `users` use `ondelete="SET NULL"` so deleting a gig or removing a member never orphans or breaks historical records.