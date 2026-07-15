#!/usr/bin/env sh
# Runs as the backend service's buildCommand on Vercel (see vercel.json).
# Applies migrations and seeds so the schema is up to date before the
# deployment goes live — the serverless runtime has no boot command,
# unlike the Docker image (backend/Dockerfile), which does this on start.
set -e

if [ "$VERCEL_ENV" != "production" ]; then
    echo "Skipping migrations and seeds (VERCEL_ENV=${VERCEL_ENV:-unset})"
    exit 0
fi

# Alembic works best on a direct connection; the pooled Neon string stays
# in DATABASE_URL for the runtime. Set MIGRATIONS_DATABASE_URL in Vercel
# to Neon's direct (non-pooler) connection string.
if [ -n "$MIGRATIONS_DATABASE_URL" ]; then
    export DATABASE_URL="$MIGRATIONS_DATABASE_URL"
fi

uv run alembic upgrade head
uv run python -m app.seeds
