# Mavva — Contrato da API (v1)

Base: `/api/v1` · Autenticação: `Authorization: Bearer <access_token>` (exceto rotas de auth)
Erros seguem o formato `{"detail": "mensagem"}` (padrão FastAPI) com status HTTP semântico.

## Auth

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/register` | Cria conta **não verificada**. Body: `{name, email, password, accepted_terms: true}`. Recusa sem o aceite (422). Envia e-mail de confirmação. **Não** emite tokens. 409 se o e-mail já existe. Resposta inclui `retry_after` (segundos até poder reenviar). |
| POST | `/auth/verify-email` | Body: `{token}`. Confirma a conta, emite `{access_token, user}` + cookie `refresh_token`. |
| POST | `/auth/resend-verification` | Body: `{email}`. Sempre 202 (não revela existência). Cooldown de 60s por conta; `retry_after` diz quanto falta. Invalida links anteriores quando envia de fato. |
| POST | `/auth/login` | Body: `{email, password}`. 401 se senha errada; **403** se a conta ainda não confirmou o e-mail ou está inativa. Retorna `{access_token, user}` + cookie httpOnly `refresh_token`. |
| POST | `/auth/refresh` | Usa o cookie; rotaciona o refresh e retorna novo `access_token`. Reuso de token revogado ⇒ 401 + revogação da cadeia. |
| POST | `/auth/logout` | Revoga o refresh atual e limpa o cookie. |
| POST | `/auth/forgot-password` | Body: `{email}`. Sempre 202 (não revela existência). Envia e-mail com token. Mesmo cooldown de 60s (`retry_after`). |
| POST | `/auth/reset-password` | Body: `{token, new_password}`. Invalida todos os refresh tokens do usuário. Também confirma o e-mail, se ainda não estiver. |

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
| DELETE | `/users/me` | Apaga a conta. Body: `{password}`. 403 se a senha estiver errada. 204 + limpa o cookie. Perfil confirma com senha + digitar "APAGAR". |

## Catálogo

| Método | Rota | Descrição |
|---|---|---|
| GET | `/categories` | Lista as 23 categorias com contagem de perguntas ativas e estatísticas do usuário (respondidas, acurácia). |

## Quiz

| Método | Rota | Descrição |
|---|---|---|
| POST | `/quizzes` | Cria sessão. Body: `{mode, question_count, testament?, category_ids?: int[], difficulty?, timer_seconds?: 15\|30}`. Sorteia e congela as perguntas (fila inteligente). `mode=review` ignora filtros e puxa da fila SRS. |
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
ainda não foi respondida (UNIQUE no banco). As alternativas são **embaralhadas no
servidor** por sessão (ordem estável entre recarregamentos), então a posição da
resposta correta não pode ser inferida chamando a API diretamente.

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
| GET | `/reviews/summary` | `{due_today, due_this_week, total_items, spacing_preview}` — ver abaixo. |

*(A sessão de revisão é criada via `POST /quizzes` com `mode=review`.)*

As contagens descrevem **exatamente o baralho de onde a sessão sorteia**, com as
configurações atuais do jogador — a contagem e o sorteio usam o mesmo filtro
(`srs._in_deck` + `srs._effective_due`), então "para hoje" nunca promete uma
pergunta que "Revisar" não entrega:

- Perguntas desativadas não contam nem são sorteadas.
- `review_scope = mistakes` mantém só itens já errados alguma vez (`lapses > 0`); os
  demais continuam guardados e voltam se o jogador trocar para `all`.
- `review_max_interval_days` vale na hora: um item agendado além do limite vence no
  máximo N dias depois da última revisão (`due_date − interval_days + N`), calculado
  na leitura — o agendamento salvo não é reescrito, então tirar o limite o restaura.
- `due_today`: vencidas até hoje (inclui atrasadas), no fuso do jogador.
- `due_this_week`: vencem de hoje até daqui a 6 dias (7 dias corridos, inclui atrasadas).
- `total_items`: itens no baralho com as configurações atuais.
- `spacing_preview`: `{intensive|balanced|relaxed: [dias]}` — em quantos dias uma
  pergunta nova volta após cada acerto seguido (5 passos), rodando o próprio
  agendador com o limite do jogador. A tela usa isso em vez de manter uma cópia.

O espaçamento (`review_spacing`) só vale a partir da próxima resposta de cada
pergunta — o agendamento já feito não muda, como no Anki. O badge do dashboard
(`reviews_due`) usa a mesma contagem de `due_today`.

## Amigos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/friends` | `{friends, incoming, sent}` — amigos e pedidos pendentes (nunca expõe e-mail). Contas inativas ficam de fora das três listas e do contador `friend_requests` do dashboard; se a conta for reativada, a amizade volta. |
| GET | `/friends/search?q=` | Busca por **prefixo de username** (mín. 2 caracteres), com a relação atual (`none`, `pending_sent`, `pending_received`, `friends`). |
| POST | `/friends/requests` | Body: `{username}`. Se a outra pessoa já havia convidado, a amizade é aceita direto. |
| POST | `/friends/requests/{id}/accept` · `/decline` | Responde um pedido recebido. |
| DELETE | `/friends/{user_id}` | Desfaz a amizade. |

## Ranking

| Método | Rota | Descrição |
|---|---|---|
| GET | `/ranking/global` | `{top, me, total_players}`: top 10 por XP (empate desempata pelo username), a posição de quem pede (`me`, mesmo fora do top) e o total de jogadores. Contas inativas não entram no top, na posição nem no total. |
| GET | `/ranking/friends` | `{entries}`: você e seus amigos ordenados por XP. Amigos com conta inativa ficam de fora. |

## Jogadores

| Método | Rota | Descrição |
|---|---|---|
| GET | `/players/{id}` | Perfil público de outro jogador — aberto pelo ranking e pela lista de amigos. Qualquer jogador logado pode ver (o ranking global já mostra desconhecidos). Devolve `user` (`PublicUser`), `relation` (`self`/`friends`/`pending_sent`/`pending_received`/`none`), `member_since` (`"YYYY-MM"`, só o mês), `stats` (XP, progresso no nível, sequência atual/recorde, respondidas, precisão, sessões perfeitas), `achievements_unlocked`/`achievements_total`, `recent_achievements` (até 4, mais recentes primeiro, sem data) e `strongest_categories` (até 3, só com ≥ 5 respostas). **Nunca** inclui e-mail, fuso, meta diária, papel, datas de atividade ou de desbloqueio. 404 para id desconhecido ou conta inativa (igual ao ranking). |

## Duelos

Assíncronos: os dois jogadores respondem **as mesmas 10 perguntas congeladas**
(20s cada, **somente múltipla escolha**, todas as categorias e dificuldades).
Cada lado joga uma `QuizSession`
normal em modo `duel` — por isso as respostas contam para acurácia, desempenho
por categoria, revisão espaçada e streak como qualquer estudo.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/duels` | Body: `{opponent_username?}`. Com username → desafia um amigo (404 se a conta estiver inativa). Sem → entra na fila aleatória (assume o duelo `open` mais antigo, ou abre um). |
| GET | `/duels` | Meus duelos + `record` (V/D/E, sequência, aproveitamento) + `awaiting_me`. |
| GET | `/duels/{id}` | Placar do duelo (404 para quem não joga nele). Resolve preguiçosamente vencidos. |

**Resolução:** vence quem acertar mais; empate em acertos desempata pelo tempo
total; igual nos dois → empate. Prazo de 48h: quem jogou vence por W.O.; se
ninguém jogou, expira sem mover XP.

**Desistência:** `POST /quizzes/{id}/abandon` numa rodada de duelo muda o duelo
para `cancelled`, conta derrota para quem saiu e vitória para o rival (se já
houver um). Um duelo `open` cancelado sai da fila e não pareia mais.

**Aposta:** +50 (vitória) · +10 (empate) · −25 (derrota). Em duelos as respostas
**não pagam XP individual** — só o resultado move a pontuação (e conta para a meta
diária). O XP total do usuário nunca fica negativo.

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
| GET | `/admin/dashboard` | Contagens agregadas da tela inicial (`users`, `questions`, `review`, `activity`). Só `COUNT`/`SUM`/`MAX` — não carrega linhas. |
| GET | `/admin/activity?start&end` | Painel de atividade entre dois dias (`YYYY-MM-DD`, inclusivos, calendário de Brasília). Sem `start` = desde o início; sem `end` (ou no futuro) = hoje; `start` depois de `end` = 400. Devolve `totals` do período (jogadores ativos, novos usuários, respostas, XP, tempo, sessões por modo, duelos, amizades, conquistas, denúncias/sugestões recebidas), `previous` (mesmos KPIs na janela de mesmo tamanho logo antes; `null` desde o início), `series` (por dia até 92 dias, por semana até 2 anos, por mês acima; buckets vazios vêm com zero; ativos = jogadores distintos no bucket) e os 5 destaques de `top_categories` e `top_players` (por XP). A série começa no primeiro dia com dados quando o período pede antes disso (`range.first_day`). Métricas de jogador vêm de `daily_activities` (dia no fuso do jogador); eventos usam o horário de Brasília. |
| GET | `/admin/users?search&sort&limit&offset` | Lista usuários com stats, `email_verified_at` e `is_active`. `sort` ordena por qualquer coluna clicável da tabela (`name`, `email_verified`, `is_active`, `role`, `xp`, `streak`, `answered`, `accuracy`); prefixo `-` inverte. |
| GET | `/admin/users/{id}` | Detalhe do usuário (conta, progresso, duelos). |
| PATCH | `/admin/users/{id}` | Body: `{is_active}`. Inativar revoga sessões. Não vale para a própria conta (400). |
| GET | `/admin/users/{id}/export` | Cópia JSON dos dados do titular (LGPD art. 18: cadastro, stats, quizzes, duelos, amigos). Sem senha nem hash. Admin-only enquanto o self-service (`/users/me/export`) fica desativado. 429 se já exportado nas últimas 6 h (`Retry-After`). |
| GET | `/admin/categories` | Categorias (id, slug, nome, ícone) para os filtros/edição. |
| GET | `/admin/questions?search&category_id&difficulty&type&limit&offset` | Lista paginada de perguntas. |
| GET | `/admin/questions/{id}` | Detalhe completo (enunciado, explicação, referência, opções, respostas). |
| PATCH | `/admin/questions/{id}` | Edita campos enviados (`exclude_unset`). Valida MC (4 opções, 1 correta) e aberta (≥1 resposta). `type` e `category_id` são imutáveis. |
| GET | `/admin/content/status` | Compara o banco com `content/questions/*.json`: `{mode: github\|local, dirty_files}`. |
| POST | `/admin/content/publish` | Reescreve os arquivos a partir do banco. `mode=local` grava em disco; `mode=github` (com `GITHUB_TOKEN`) abre ou atualiza um PR contra a branch configurada e retorna `pr_url`. |

## Saúde

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | `{"status": "ok"}` — usado pelo Render e pelo CI. |

## Paginação e filtros

Listagens usam `limit`/`offset` com envelope `{items, total, limit, offset}`.
Filtros de quiz são validados contra os enums do banco (400 em valor inválido).
