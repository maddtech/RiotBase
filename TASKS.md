# RiotBase — Active Tasks

## 🤖 AI Agent Guardrails (READ FIRST)
- **Review Roadmap:** Please read the ROADMAP.md to stay updated on current direction of the project.
- **Active Scope:** Only execute tasks under **Phase 1: Current Sprint**. Do not modify database schemas or UI components for **Phase 2** or **Backlog** items unless explicitly instructed.
- **Tech Stack Constraints:** FastAPI backend, SQLite (keep WAL mode intact), React + TypeScript + Tailwind CSS frontend. Do not introduce new third-party SaaS dependencies or external auth providers.
- **Completion Protocol:** When a task is verified working, check its box (`[x]`), add a brief note of modified files under **Completed**, and stop before picking up the next task.

---

## Phase 1 : v1.1.0 - Core UI\UX updates
- [x] **Event Flyer Attachments:** Upload, preview, and download show flyers (`JPG`, `PNG`, `WebP`) on Event records, persisted in `/data/uploads/flyers/{band_id}/` and referenced in JSON backups.
- [ ] **Band Module Toggle Framework:**
   - [ ] `enabled_modules` JSON column on `Band` with Band Admin toggle controls in **Settings** (`PATCH /api/v1/bands/{band_id}/modules`).
   - [ ] `require_module("<key>")` FastAPI dependency guard and React `MODULE_REGISTRY` lazy-loaded navigation.
   - [ ] Non-destructive toggles: disabling a module hides UI routes and blocks API endpoints without deleting underlying database rows.

## Completed
- **Event Flyer Attachments (v1.1.0):** Added single-flyer upload/preview/download/delete per event with Pillow verification (`JPG`, `PNG`, `WebP`, up to 10 MB), EXIF orientation normalization & metadata stripping, `/data/uploads/flyers/{band_id}/` storage, disk cleanup on replace/delete, and JSON backup export/import references.
  - Modified/added: `backend/requirements.txt`, `backend/app/models/core.py`, `backend/alembic/versions/9c4e7f2a1d8b_add_event_flyer_columns.py`, `backend/app/services/flyer_storage.py`, `backend/app/schemas/calendar_venues.py`, `backend/app/routers/calendar_venues.py`, `backend/app/routers/utilities_admin.py`, `frontend/src/api/client.ts`, `frontend/src/components/EventFlyerPreview.tsx`, `frontend/src/pages/CalendarPage.tsx`, `frontend/src/pages/DashboardPage.tsx`.




## 🧊 Backlog / Feature Improvements / Small Updates
- [ ] ** Save the "Stage View" setlist as a PDF.
- [ ] Add Reverse Proxy instructions for proxmox LXC\Docker Installs.
- [ ] Space out "Stage View" layout for better view on mobile.


## Bug Fixes
- [ ] Adjust the placement of the Song Title and other data on the "Stage View" option so it appears better for mobile users. 