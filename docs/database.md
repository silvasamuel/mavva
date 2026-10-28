# Mavva — Modelo de Dados (PostgreSQL 16)

Convenções: tabelas no plural, `snake_case`, PKs `id UUID` (exceto tabelas de catálogo,
que usam `int`), timestamps `TIMESTAMPTZ` em UTC, FKs com `ON DELETE CASCADE` quando o
filho não faz sentido sem o pai.

## Diagrama (visão geral)

```mermaid
erDiagram
    users ||--o{ refresh_tokens : has
    users ||--o{ password_reset_tokens : has
    users ||--|| user_stats : has
    users ||--o{ season_results : finished
    seasons ||--o{ season_results : archives
    users ||--o{ daily_activities : logs
    users ||--o{ quiz_sessions : plays
    users ||--o{ review_items : reviews
    users ||--o{ user_achievements : unlocks
    achievements ||--o{ user_achievements : granted
    categories ||--o{ questions : contains
    questions ||--o{ question_options : has
    questions ||--o{ question_answers : accepts
    quiz_sessions ||--o{ quiz_session_questions : includes
    quiz_sessions ||--o{ quiz_answers : records
    questions ||--o{ quiz_session_questions : appears_in
    questions ||--o{ quiz_answers : answered_as
    questions ||--o{ review_items : scheduled
```

## Tabelas

### users
| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| email | VARCHAR(255) UNIQUE | login; normalizado para minúsculas na aplicação |
| name | VARCHAR(120) | |
| hashed_password | VARCHAR | bcrypt |
| role | ENUM(user, admin) | admin para o futuro painel |
| timezone | VARCHAR(64) | default `America/Sao_Paulo`; base do streak |
| daily_goal_xp | INT | default 50 |
| tutorial_completed_at | TIMESTAMPTZ NULL | quando o jogador terminou ou pulou o tutorial do primeiro login; null = ainda não viu |
| season_start_seen / season_end_seen | INT NULL | número da última temporada cujo aviso de início / fim o jogador fechou; null = nunca |
| notifications_seen_at | TIMESTAMPTZ NULL | última vez que abriu "Novidades"; null = conta a partir do cadastro |
| champion_seen_season | INT NULL | última temporada cuja comemoração de campeão o jogador viu |
| created_at / updated_at | TIMESTAMPTZ | |

### refresh_tokens
| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK→users | CASCADE |
| token_hash | VARCHAR(64) UNIQUE | SHA-256 do token opaco — token puro nunca é persistido |
| expires_at | TIMESTAMPTZ | +30 dias |
| revoked_at | TIMESTAMPTZ NULL | preenchido na rotação/logout |
| created_at | TIMESTAMPTZ | |

### password_reset_tokens
`id, user_id FK, token_hash UNIQUE, expires_at (+30 min), used_at NULL, created_at`

### categories *(catálogo, seed)*
| Coluna | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| slug | VARCHAR UNIQUE | ex: `personagens` |
| name | VARCHAR | ex: "Personagens" |
| description | TEXT | |
| icon | VARCHAR | emoji/nome de ícone |
| display_order | INT | ordem na UI |

### questions
| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| external_id | VARCHAR UNIQUE | slug do seed (`personagens-0001`) — upsert idempotente |
| type | ENUM(multiple_choice, open_answer) | |
| text | TEXT | enunciado |
| explanation | TEXT | sempre presente; cita ARC quando útil |
| divergence_note | TEXT NULL | preenchida quando há divergência entre interpretações cristãs ou base em tradição |
| testament | ENUM(old, new) | derivado do livro, mas materializado p/ filtro |
| book | VARCHAR(40) | slug canônico (`genesis`, `mateus`…) — validado contra catálogo dos 66 livros |
| chapter | INT | |
| verse_start / verse_end | INT / INT NULL | intervalo de versículos |
| difficulty | ENUM(easy, medium, hard, expert) | |
| category_id | INT FK→categories | |
| is_active | BOOL | soft-disable sem apagar histórico |
| created_at / updated_at | TIMESTAMPTZ | |

Índices: `(category_id, difficulty)`, `(testament)`.

### question_options *(múltipla escolha — exatamente 4 por pergunta, 1 correta)*
`id UUID PK, question_id FK CASCADE, text TEXT, is_correct BOOL, position INT`
Constraint de aplicação (validada no seed): 4 opções, exatamente 1 `is_correct`.

### question_answers *(resposta aberta — variações aceitas)*
`id UUID PK, question_id FK CASCADE, text VARCHAR, position INT`
`position = 0` é a resposta canônica exibida no feedback.

### quiz_sessions
| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK | |
| mode | ENUM(practice, review) | review consome a fila SRS |
| filters | JSONB | `{testament, category_ids, difficulty}` — snapshot do que foi pedido |
| question_count | INT | |
| correct_count | INT | atualizado a cada resposta |
| xp_earned | INT | consolidado no complete |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ NULL | sessão abandonada fica NULL |
| duration_seconds | INT NULL | |

### quiz_session_questions *(perguntas sorteadas na criação — ordem fixa, anti-refetch)*
`session_id FK, question_id FK, position INT` — PK composta `(session_id, question_id)`.

### quiz_answers
| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| session_id | UUID FK CASCADE | |
| question_id | UUID FK | |
| selected_option_id | UUID NULL | múltipla escolha |
| answer_text | TEXT NULL | resposta aberta (como digitada) |
| is_correct | BOOL | |
| time_spent_seconds | INT NULL | |
| answered_at | TIMESTAMPTZ | |

UNIQUE `(session_id, question_id)` — impede responder duas vezes.

### user_stats *(denormalização 1:1 — dashboard em uma query)*
| Coluna | Tipo |
|---|---|
| user_id | UUID PK FK |
| total_xp / level | INT / INT *(da temporada atual — zeram no dia 1º)* |
| best_level | INT *(maior nível já alcançado ao fechar uma temporada)* |
| last_season_level | INT NULL *(nível ao fim da temporada passada; NULL se não jogou)* |
| current_streak / longest_streak | INT / INT |
| last_activity_date | DATE NULL *(no fuso do usuário)* |
| questions_answered / correct_answers | INT / INT |
| perfect_sessions | INT |
| total_time_seconds | INT |
| updated_at | TIMESTAMPTZ |

> Atualizada transacionalmente pelo serviço de gamificação ao completar sessões.
> Fonte da verdade recuperável: pode ser recalculada de `quiz_answers`/`daily_activities`.

### seasons *(um mês do calendário, horário de Brasília)*
`id INT PK, number INT UNIQUE, starts_on DATE, ends_on DATE, closed_at TIMESTAMPTZ NULL`
`ends_on` é o primeiro dia da próxima temporada (exclusivo). Criada e fechada sob demanda
pela primeira requisição autenticada do mês (`season_service.ensure_current_season`).

### season_results *(onde cada jogador terminou uma temporada)*
`id INT PK, season_id FK, user_id FK, final_xp INT, final_level INT, rank_code VARCHAR(20),
position INT NULL, created_at` — UNIQUE `(season_id, user_id)`, índice em `user_id`.
Só jogadores que ganharam XP na temporada. `position` segue a ordem do ranking global
(XP, depois username) e é NULL para contas inativas. Id inteiro gerado pelo banco porque
as linhas entram num único `INSERT … SELECT`.

### announcements *(novidades publicadas pela equipe)*
`id UUID PK, title VARCHAR(120), body TEXT, kind ENUM(feature, improvement, fix, notice),
published_at TIMESTAMPTZ NULL, created_by_id FK users (SET NULL), created_at, updated_at`
`published_at` nulo = rascunho; índice em `published_at`. Não lido para um jogador =
`published_at > coalesce(users.notifications_seen_at, users.created_at)`.

### daily_activities *(série temporal do gráfico de evolução + cálculo de streak)*
`id UUID PK, user_id FK, date DATE, xp INT, questions INT, correct INT, time_seconds INT`
UNIQUE `(user_id, date)`. `date` já convertida para o fuso do usuário.

### review_items *(repetição espaçada — SM-2)*
| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| user_id / question_id | FKs | UNIQUE `(user_id, question_id)` |
| repetitions | INT | acertos consecutivos |
| ease_factor | FLOAT | default 2.5, piso 1.3 |
| interval_days | INT | próximo intervalo |
| due_date | DATE | índice `(user_id, due_date)` |
| lapses | INT | total de erros |
| last_reviewed_at | TIMESTAMPTZ | |

**Algoritmo (SM-2 simplificado, qualidade binária):**
- Acerto: `repetitions += 1`; intervalo = 1d → 3d → `round(intervalo × ease_factor)`; `ease_factor += 0.05` (teto 2.8)
- Erro: `repetitions = 0`; intervalo = 1d; `ease_factor −= 0.2` (piso 1.3); `lapses += 1`

### achievements *(catálogo, seed)*
`id INT PK, code VARCHAR UNIQUE, name, description, icon, criteria JSONB`
`criteria` ex.: `{"type": "streak", "value": 7}`, `{"type": "total_correct", "value": 100}`,
`{"type": "category_correct", "category": "parabolas", "value": 25}`, `{"type": "perfect_sessions", "value": 10}`.

### user_achievements
`user_id FK, achievement_id FK, unlocked_at` — PK composta.

## Decisões de modelagem

1. **`user_stats` denormalizada** — o dashboard é a tela mais acessada; uma linha por
   usuário evita agregações repetidas. Consistência garantida por atualização na mesma
   transação da resposta/sessão, e sempre recalculável a partir do histórico.
2. **`quiz_session_questions` separada de `quiz_answers`** — as perguntas são sorteadas
   e congeladas na criação da sessão; recarregar a página não sorteia de novo e o
   backend valida que a resposta pertence à sessão.
3. **Respostas aceitas em tabela própria** — permite N variações por pergunta aberta
   ("Simão Pedro", "Pedro", "Cefas") sem JSON opaco, e futura curadoria via admin.
4. **`external_id` nas perguntas** — o seed roda quantas vezes for preciso (upsert);
   edições no JSON atualizam a pergunta sem duplicar nem perder histórico de respostas.
5. **Enums nativos do Postgres** para `difficulty`, `type`, `testament`, `role` —
   integridade no banco, não só na aplicação.
6. **`users.tutorial_completed_at` com backfill** — a migration `c1d2e3f4a5b6` cria a
   coluna nula e preenche `now()` em todas as contas existentes: só quem se cadastra
   depois do deploy vê o tutorial. Cadastros novos nascem com null; o
   `POST /users/me/tutorial` grava a data uma única vez (idempotente). Timestamp em
   vez de booleano para saber quando foi visto, se um dia o tutorial mudar.
