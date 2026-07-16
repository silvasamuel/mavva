# Mavva — Arquitetura

## 1. Decisões estruturais (e por quê)

| Decisão | Escolha | Justificativa |
|---|---|---|
| Repositório | **Monorepo** (`backend/` + `frontend/`) | Um só lugar para contratos de API, docs e CI. O futuro app mobile (React Native) entra como `mobile/` reutilizando tipos e client de API. |
| Backend | **FastAPI + camada de serviços** | Routers finos (HTTP), serviços com regra de negócio, models SQLAlchemy. Testável sem HTTP e sem over-engineering (nada de repository pattern completo no MVP). |
| API | **Versionada em `/api/v1`** | O app mobile futuro poderá depender de `v1` estável enquanto a web evolui para `v2`. |
| Frontend | **Feature-based** (`features/auth`, `features/quiz`…) | Cada feature é autocontida (páginas, hooks, componentes, api). Escala melhor que separar por tipo de arquivo. |
| Estado servidor | **React Query** | Cache, invalidação e retry de dados da API. Sem Redux — estado global de cliente é mínimo (só sessão de auth, via context). |
| Banco | **PostgreSQL 16** | Relacional (quiz ↔ perguntas ↔ respostas), JSONB para filtros, arrays para tags. |
| Python | **3.12 + uv** | uv é ordens de magnitude mais rápido que pip/poetry e gera lockfile determinístico. |
| Node | **pnpm** | Instalação rápida, disco eficiente, padrão moderno para monorepos. |
| IDs | **UUID v4** | Seguro para expor na API e pronto para sync offline no futuro (mobile gera IDs localmente sem colisão). |
| Datas | **UTC no banco; fuso do usuário para regras diárias** | Streak e meta diária calculados no timezone do usuário (padrão `America/Sao_Paulo`). |

## 2. Estrutura de pastas

```
mavva/
├── docs/                       # PRD, arquitetura, banco, API, frontend, roadmap
├── content/
│   └── questions/              # Banco de perguntas versionado (JSON por categoria)
├── backend/
│   ├── app/
│   │   ├── main.py             # criação do app, middlewares, routers
│   │   ├── core/               # config (pydantic-settings), security (JWT/hash), deps
│   │   ├── db/                 # engine, session, Base
│   │   ├── models/             # SQLAlchemy (1 arquivo por agregado)
│   │   ├── schemas/            # Pydantic (request/response)
│   │   ├── api/v1/             # routers HTTP finos
│   │   ├── services/           # regra de negócio (quiz, gamificação, SRS, auth…)
│   │   └── seeds/              # carga idempotente de categorias/perguntas/conquistas
│   ├── alembic/                # migrations
│   ├── tests/                  # pytest (unit + integração com Postgres)
│   ├── pyproject.toml          # deps + ruff + mypy + pytest config
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/                # providers, router, layout raiz
│   │   ├── features/           # auth, dashboard, quiz, review, achievements, profile
│   │   ├── components/ui/      # design system (Button, Card, ProgressRing…)
│   │   ├── lib/                # apiClient (fetch + refresh automático), utils
│   │   └── types/              # tipos da API (espelham schemas Pydantic)
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml          # dev local: postgres + backend + frontend
├── .github/workflows/ci.yml    # lint + typecheck + testes + build
├── .pre-commit-config.yaml
└── README.md
```

## 3. Backend

### Camadas

```
HTTP (api/v1/*)  →  Services (regra de negócio)  →  Models/DB (SQLAlchemy)
      ↑ Schemas Pydantic (entrada/saída)   ↑ Session injetada via Depends
```

- **Routers** só traduzem HTTP ↔ domínio: validam com Pydantic, chamam serviço, retornam schema.
- **Services** concentram regras: seleção de perguntas, correção de resposta aberta,
  XP/nível/streak, SM-2, conquistas. São funções/classes puras que recebem a `Session` —
  testáveis diretamente.
- **Models** não contêm regra de negócio (apenas relacionamentos e constraints).

### Autenticação (JWT + refresh com rotação)

- **Access token:** JWT assinado (HS256), 15 min, enviado em `Authorization: Bearer`.
  Guardado **em memória** no frontend (nunca em localStorage — mitiga XSS).
- **Refresh token:** opaco (256 bits aleatórios), 30 dias, guardado **hasheado (SHA-256)**
  no banco. Entregue via **cookie httpOnly + Secure + SameSite=None** (web).
- **Rotação:** cada `/auth/refresh` invalida o token usado e emite um novo par.
  Reuso de token já rotacionado ⇒ revoga a cadeia inteira (detecção de roubo).
- **Mobile (futuro):** mesmos endpoints aceitarão/retornarão o refresh token no corpo
  (header `X-Client: mobile`), pois apps nativos não usam cookies.
- **Recuperação de senha:** token de uso único (hasheado no banco), expira em 30 min.
  Em dev o link é logado no console; em produção, e-mail via SMTP (Resend/Brevo free tier).

### Correção de resposta aberta

1. Normalização: minúsculas, remoção de acentos (NFD), pontuação e espaços duplicados.
2. Comparação contra a lista de respostas aceitas da pergunta.
3. Tolerância a erro de digitação: distância de Levenshtein via `rapidfuzz`
   (≤1 para respostas curtas, proporcional para longas — `ratio ≥ 90`).

### Painel admin (segurança)

- **Barreira real = backend.** Todo endpoint `/api/v1/admin/*` exige `role = admin`
  (dependência `AdminUser` → 403). O papel é lido do banco pelo id do JWT assinado,
  então nenhuma alteração no front-end escala privilégio.
- **Front-end isolado.** O admin é um **bundle Vite separado** (`admin.html` →
  `src/admin/`). O app do usuário (`index.html`) nunca importa nada de `src/admin/`,
  então o bundle do usuário não contém código nem assets do admin (verificável:
  `grep admin dist/assets/main-*.js` = 0). Servido em `/admin` via `vercel.json`
  (prod) e middleware de dev do Vite (local).
- Edições do admin gravam **no banco** (dado vivo) e são **publicadas de volta**
  para `content/questions/*.json` pelo botão "Publicar" (`POST /admin/content/publish`):
  em dev escreve nos arquivos (revisão via git); em produção cria **um commit** na
  `main` via API do GitHub (`GITHUB_TOKEN`, PAT fine-grained só com `contents:write`) —
  o deploy disparado pelo commit roda o seed e realinha o banco, fechando o ciclo.
  O serializador regenera os arquivos no formato canônico do seed (diffs mínimos)
  e `is_active` faz parte do schema, então desativações sobrevivem ao re-seed.

### Migrations

- Alembic com `autogenerate` + revisão manual obrigatória de cada migration.
- Convenção de nome: `YYYYMMDD_HHMM_slug.py`. CI roda `alembic upgrade head` num
  Postgres efêmero para garantir que migrations aplicam do zero.

### Seeds

- `python -m app.seeds` — idempotente (upsert por `external_id`/`slug`/`code`).
- Perguntas ficam em `content/questions/*.json`, validadas por schema Pydantic no seed
  (referência bíblica precisa apontar para livro/capítulo válidos).

## 4. Frontend

- **Vite + React 18 + TypeScript strict.**
- **Rotas** (React Router): públicas (`/login`, `/register`, `/forgot-password`,
  `/reset-password`) e protegidas via `<RequireAuth>` (`/`, `/quiz/*`, `/review`,
  `/achievements`, `/profile`).
- **apiClient:** wrapper de `fetch` que injeta o access token, e num `401` tenta
  `/auth/refresh` uma vez (fila de requests pendentes) antes de deslogar.
- **React Query:** todas as leituras da API são queries com chaves padronizadas
  (`['dashboard']`, `['quiz', id]`…); mutações invalidam as chaves afetadas.
- **Design system próprio** em `components/ui/` com Tailwind — sem lib de componentes
  pesada; mantém o bundle leve e o visual único.
- **Animações:** `motion` (framer-motion) para transições de página, feedback de
  acerto/erro e contadores de XP.

## 5. Convenções

- **Código em inglês** (nomes de variáveis, funções, tabelas); **conteúdo e UI em pt-BR**.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…).
- Branches: `main` protegida; trabalho em `feat/*`, `fix/*`.
- Python: `ruff` (lint + format, substitui black/isort/flake8) + `mypy` (strict nos serviços).
- TypeScript: `eslint` + `prettier`; `tsc --noEmit` no CI.
- Pre-commit: ruff, ruff-format, checagens de hygiene (EOF, trailing whitespace, JSON válido).

## 6. Testes

| Camada | Ferramenta | O que cobre |
|---|---|---|
| Backend unit | pytest | gamificação (XP/nível/streak), SM-2, normalização de resposta aberta |
| Backend integração | pytest + httpx + Postgres (docker) | fluxos de auth, quiz completo, dashboard |
| Frontend unit | vitest + testing-library | componentes de quiz, utils |
| E2E (fase 2) | Playwright | fluxo login → quiz → dashboard |

Regra: **toda regra de gamificação nasce com teste** — é o coração do produto.

## 7. Ambientes

### Dev local
`docker compose up` sobe Postgres 16, backend (uvicorn `--reload`) e frontend (vite dev).
Alternativa sem Docker: Postgres local + `uv run uvicorn` + `pnpm dev`.

### Produção (free tier — custo R$ 0)

| Peça | Serviço | Observação |
|---|---|---|
| Frontend | **Vercel** | Deploy automático do diretório `frontend/` a cada push na `main`. |
| Backend | **Render (free)** | Container Docker; dorme após 15 min ocioso (cold start ~30 s). |
| Banco | **Neon (free)** | Postgres serverless, 0,5 GB, branch de banco para testes. |
| E-mail | **Resend (free)** | 100 e-mails/dia — suficiente para reset de senha. |

Migração futura (quando houver usuários pagantes ou o cold start incomodar):
Railway/Fly.io ou VPS — trivial, pois o backend já roda em Docker.

## 8. CI/CD (GitHub Actions)

Pipeline em todo push/PR:
1. **backend:** ruff → mypy → alembic upgrade (Postgres de serviço) → pytest
2. **frontend:** eslint → tsc → vitest → vite build
3. **content:** validação do schema das perguntas em `content/questions/`

Deploy contínuo: Vercel e Render observam a `main` (deploy automático após CI verde).

## 9. Segurança

- Senhas: bcrypt (via passlib), custo 12.
- Rate limiting nos endpoints de auth (slowapi) — mitiga brute force.
- CORS restrito às origens conhecidas (localhost em dev, domínio Vercel em prod).
- Nunca revelar se um e-mail existe (`/forgot-password` responde 200 sempre).
- Refresh token: httpOnly + Secure + rotação + detecção de reuso.
- Headers de segurança no frontend via `vercel.json` (CSP básica, X-Frame-Options).
