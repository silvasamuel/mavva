# Mavva 🍞

> Do grego *mánna* — o alimento diário. Estude a Bíblia todos os dias, como quem recolhe o maná.

Plataforma de estudo bíblico gamificada (estilo Duolingo): quizzes com explicação e
referência, XP, níveis, streak, metas diárias, conquistas e revisão espaçada (SM-2).

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS + React Query + React Router |
| Backend | Python 3.12 + FastAPI + Pydantic v2 + SQLAlchemy 2 + Alembic |
| Banco | PostgreSQL 16 |
| Auth | JWT (access 15 min) + refresh token com rotação (cookie httpOnly) |

## Documentação

- [PRD](docs/prd.md) — visão de produto e funcionalidades
- [Arquitetura](docs/architecture.md) — decisões, camadas, convenções, segurança
- [Banco de dados](docs/database.md) — modelo completo com justificativas
- [API](docs/api.md) — contrato v1
- [Frontend](docs/frontend.md) — navegação, componentes, design system
- [Roadmap](docs/roadmap.md) — MVP e fases futuras
- [Diretrizes de conteúdo](docs/content-guidelines.md) — regras editoriais do banco de perguntas

## Rodando localmente

### Com Docker (recomendado)

```bash
docker compose up
```

- Frontend: http://localhost:5173
- API + docs: http://localhost:8000/docs
- Postgres: localhost:5433 (`mavva`/`mavva`)

Na primeira vez, aplique as migrations e o seed:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seeds
```

### Sem Docker

```bash
# Banco (uma vez)
docker compose up -d db

# Backend
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.seeds
uv run uvicorn app.main:app --reload

# Frontend (outro terminal)
cd frontend
pnpm install
pnpm dev
```

## Testes e qualidade

```bash
# Backend
cd backend
uv run pytest            # testes (precisa do Postgres do compose)
uv run ruff check app tests
uv run mypy app

# Frontend
cd frontend
pnpm test
pnpm lint && pnpm typecheck

# Validar o banco de perguntas sem tocar no banco
cd backend && uv run python -m app.seeds --validate-only
```

Hooks de pre-commit: `pipx install pre-commit && pre-commit install`.

## Banco de perguntas

As perguntas vivem em [`content/questions/`](content/questions/) (um JSON por categoria)
e são carregadas com upsert idempotente (`python -m app.seeds`). Formato e regras
editoriais: [docs/content-guidelines.md](docs/content-guidelines.md).

## Deploy (free tier)

| Peça | Serviço | Como |
|---|---|---|
| Frontend | Vercel | Importar o repo, root `frontend/`, framework Vite. Env: `VITE_API_URL`. |
| Backend | Render | Blueprint [`render.yaml`](render.yaml) (Docker). Env: `DATABASE_URL` (Neon), `FRONTEND_ORIGIN`. |
| Postgres | Neon | Criar projeto free e copiar a connection string. |
| E-mail | Resend | `RESEND_API_KEY` (opcional; sem ela, links de reset vão para o log). |

O container de produção roda `alembic upgrade head && python -m app.seeds` no boot —
migrations e conteúdo sempre em dia.
