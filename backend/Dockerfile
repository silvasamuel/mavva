# Build context is the REPO ROOT (not backend/) so the question bank in
# content/ ships inside the image. See docker-compose.yml and render.yaml.

# --- base ---
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 UV_COMPILE_BYTECODE=1
COPY --from=ghcr.io/astral-sh/uv:0.11.28 /uv /usr/local/bin/uv
WORKDIR /code
COPY backend/pyproject.toml backend/uv.lock ./

# --- dev: dev deps included, source mounted as volume ---
FROM base AS dev
RUN uv sync --frozen
ENV PATH="/code/.venv/bin:$PATH" CONTENT_DIR=/code/content
COPY backend/ ./
COPY content ./content
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# --- prod: lean, migrations + seed on boot (Render uses this stage) ---
FROM base AS prod
RUN uv sync --frozen --no-dev
ENV PATH="/code/.venv/bin:$PATH" CONTENT_DIR=/code/content
COPY backend/ ./
COPY content ./content
CMD ["sh", "-c", "alembic upgrade head && python -m app.seeds && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
