# Mavva — Contrato da API (v1)

Base: `/api/v1` · Autenticação: `Authorization: Bearer <access_token>` (exceto rotas de auth)
Erros seguem o formato `{"detail": "mensagem"}` (padrão FastAPI) com status HTTP semântico.

## Auth

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/register` | Cria conta. Body: `{name, email, password}`. Retorna tokens + user. |
| POST | `/auth/login` | Body: `{email, password}`. Retorna `{access_token, user}` + cookie httpOnly `refresh_token`. |
| POST | `/auth/refresh` | Usa o cookie; rotaciona o refresh e retorna novo `access_token`. Reuso de token revogado ⇒ 401 + revogação da cadeia. |
| POST | `/auth/logout` | Revoga o refresh atual e limpa o cookie. |
| POST | `/auth/forgot-password` | Body: `{email}`. Sempre 202 (não revela existência). Envia e-mail com token. |
| POST | `/auth/reset-password` | Body: `{token, new_password}`. Invalida todos os refresh tokens do usuário. |

```jsonc
// 200 POST /auth/login
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": { "id": "…", "name": "Samuel", "email": "…", "daily_goal_xp": 50, "timezone": "America/Sao_Paulo" }
}
```

## Users

| Método | Rota | Descrição |
|---|---|---|
| GET | `/users/me` | Perfil do usuário logado. |
| PATCH | `/users/me` | Atualiza `name`, `daily_goal_xp`, `timezone`. |

## Catálogo

| Método | Rota | Descrição |
|---|---|---|
| GET | `/categories` | Lista as 23 categorias com contagem de perguntas ativas e estatísticas do usuário (respondidas, acurácia). |

## Quiz

| Método | Rota | Descrição |
|---|---|---|
| POST | `/quizzes` | Cria sessão. Body: `{mode, question_count, testament?, category_ids?: int[], difficulty?, theme?, timer_seconds?: 15\|30}`. Sorteia e congela as perguntas (fila inteligente). `mode=review` ignora filtros e puxa da fila SRS. |
| GET | `/quizzes/{id}` | Estado da sessão + perguntas (**sem** gabarito: opções vêm sem `is_correct`; abertas vêm sem respostas aceitas). Inclui `timer_seconds`. |
| POST | `/quizzes/{id}/answers` | Responde uma pergunta. Body: `{question_id, selected_option_id?, answer_text?, timed_out?, time_spent_seconds}`. `timed_out=true` (tempo estourado) conta como erro. Retorna correção + explicação + referência. |
| POST | `/quizzes/{id}/complete` | Fecha a sessão: consolida XP (+bônus), atualiza stats/streak/atividade diária, agenda SRS, avalia conquistas. Retorna o resumo. |
| POST | `/quizzes/{id}/abandon` | Abandona a sessão sem terminar: aplica **apenas** as penalidades das respostas erradas e descarta o XP ganho (streak não conta). Retorna `{answered_count, wrong_count, xp_penalty}`. |
| GET | `/quizzes?limit=5` | Histórico de sessões concluídas — **máximo de 5 itens** (teto da API). |

```jsonc
// 200 POST /quizzes/{id}/answers  (feedback imediato)
{
  "is_correct": true,
  "correct_option_id": "…",            // múltipla escolha
  "correct_answer": "Melquisedeque",   // resposta aberta (canônica)
  "explanation": "Melquisedeque, rei de Salém e sacerdote do Deus Altíssimo…",
  "reference": { "book": "genesis", "book_name": "Gênesis", "chapter": 14, "verse_start": 18, "verse_end": 20, "display": "Gênesis 14:18-20" },
  "divergence_note": null,
  "xp_earned": 15
}

// 200 POST /quizzes/{id}/complete
{
  "correct_count": 9, "question_count": 10, "accuracy": 0.9,
  "xp_earned": 145, "bonus_xp": 5, "duration_seconds": 312,
  "level": { "current": 4, "leveled_up": true, "xp_into_level": 30, "xp_for_next": 125 },
  "streak": { "current": 12, "extended_today": true },
  "daily_goal": { "target": 50, "earned_today": 145, "achieved": true },
  "unlocked_achievements": [ { "code": "streak_7", "name": "Uma semana no deserto", "icon": "🔥" } ]
}
```

**Regra anti-fraude:** o gabarito nunca trafega antes da resposta; a correção acontece
exclusivamente no backend, que também valida que `question_id` pertence à sessão e
ainda não foi respondida (UNIQUE no banco).

## Dashboard

| Método | Rota | Descrição |
|---|---|---|
| GET | `/dashboard` | Payload único e agregado para a tela inicial. |

```jsonc
// 200 GET /dashboard
{
  "stats": { "total_xp": 1240, "level": 6, "xp_into_level": 40, "xp_for_next_level": 175,
             "current_streak": 12, "longest_streak": 21, "questions_answered": 342,
             "accuracy": 0.87, "total_time_seconds": 15600 },
  "daily_goal": { "target": 50, "earned_today": 30, "achieved": false },
  "evolution": [ { "date": "2026-07-01", "xp": 60, "questions": 12 }, /* 30 dias */ ],
  "categories": [ { "id": 1, "slug": "personagens", "name": "Personagens", "icon": "👤",
                    "answered": 80, "accuracy": 0.91 } ],
  "recent_sessions": [ { "id": "…", "completed_at": "…", "correct_count": 9,
                         "question_count": 10, "xp_earned": 145, "filters": {} } ],
  "reviews_due": 14,
  "recommendations": [
    { "type": "review", "reason": "14 revisões vencendo hoje" },
    { "type": "category", "category_slug": "profetas", "reason": "Sua menor acurácia (62%)" }
  ]
}
```

## Revisão (SRS)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/reviews/summary` | `{due_today, due_this_week, total_items}`. |

*(A sessão de revisão é criada via `POST /quizzes` com `mode=review`.)*

## Conquistas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/achievements` | Catálogo completo com `unlocked_at` (null se bloqueada) e progresso atual. Ordenação: desbloqueadas primeiro (mais recentes no topo), depois bloqueadas por proximidade da conclusão. |

## Admin (requer `role = admin`)

Toda rota abaixo passa pela dependência `AdminUser` no backend: **403** para
usuários comuns, **401** sem autenticação. Esta é a única barreira de segurança
real — o front-end separado (bundle `/admin`) é conveniência, não proteção.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/admin/users?search&limit&offset` | Lista usuários com stats (XP, nível, streak, precisão). |
| GET | `/admin/categories` | Categorias (id, slug, nome, ícone) para os filtros/edição. |
| GET | `/admin/questions?search&category_id&difficulty&limit&offset` | Lista paginada de perguntas. |
| GET | `/admin/questions/{id}` | Detalhe completo (enunciado, explicação, referência, opções, respostas). |
| PATCH | `/admin/questions/{id}` | Edita campos enviados (`exclude_unset`). Valida MC (4 opções, 1 correta) e aberta (≥1 resposta). `type` e `category_id` são imutáveis. |
| GET | `/admin/content/status` | Compara o banco com `content/questions/*.json`: `{mode: github\|local, dirty_files}`. |
| POST | `/admin/content/publish` | Reescreve os arquivos a partir do banco. `mode=local` grava em disco; `mode=github` (com `GITHUB_TOKEN`) cria **1 commit** na branch configurada e retorna `commit_url`. |

## Saúde

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | `{"status": "ok"}` — usado pelo Render e pelo CI. |

## Paginação e filtros

Listagens usam `limit`/`offset` com envelope `{items, total, limit, offset}`.
Filtros de quiz são validados contra os enums do banco (400 em valor inválido).
