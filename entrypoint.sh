#!/usr/bin/env sh
set -e

echo "Running database migrations..."
alembic upgrade head

if [ -z "$DATABASE_URL" ] || echo "$DATABASE_URL" | grep -q "^sqlite"; then
    WORKERS=1
    echo "Starting with SQLite backend (workers=1)..."
else
    WORKERS=${UVICORN_WORKERS:-4}
    echo "Starting with external SQL backend (workers=$WORKERS)..."
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "$WORKERS"