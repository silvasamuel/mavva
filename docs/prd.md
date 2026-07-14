# Mavva — PRD (Product Requirements Document)

> **Mavva** — do grego *mánna* (μάννα), o alimento diário dado por Deus no deserto (Êx 16).
> Plataforma de estudo bíblico gamificada: o "Duolingo da Bíblia".

## 1. Visão do produto

Ajudar cristãos a crescerem no conhecimento das Escrituras **todos os dias**, através de
quizzes curtos, progresso visível e mecânicas de hábito (streak, metas, conquistas).

**Usuário primário (persona):** Samuel — cristão evangélico, reformado, pentecostal
(Igreja Verbo da Vida), em formação pastoral. Quer profundidade teológica com
consistência diária. No futuro, a plataforma será aberta a outros usuários e terá app mobile.

**Princípio editorial inegociável:** toda pergunta é fundamentada na Bíblia Sagrada, com
referência explícita (livro, capítulo, versículo). Conteúdo baseado em tradição é
marcado como tal. Divergências entre interpretações cristãs são indicadas na explicação.

**Tradução base:** ARC (Almeida Revista e Corrigida) — domínio público, citação livre.

## 2. Proposta de valor

| Problema | Solução Mavva |
|---|---|
| Leitura bíblica sem retenção | Quizzes com explicação e referência a cada resposta |
| Falta de constância | Streak diário, meta de XP, notificações (futuro) |
| Não saber o que estudar | Recomendações por categoria fraca + revisão espaçada |
| Estudo raso | 5 níveis de dificuldade, 23 categorias, notas de divergência teológica |

## 3. Funcionalidades

### 3.1 MVP (fase 1)

**Autenticação**
- Cadastro (nome, e-mail, senha), login, logout
- Recuperação de senha por e-mail (token com expiração)
- JWT de acesso (curto) + refresh token com rotação

**Quiz**
- Múltipla escolha: 4 alternativas, 1 correta
- Resposta aberta: aceita variações de escrita (acentos, caixa, pequenos erros de digitação)
- Filtros: testamento (AT / NT / Bíblia inteira), categorias (múltipla escolha), dificuldade, tema
- Feedback imediato: correto/errado + explicação + referência bíblica (texto ARC)
- Resumo ao final: acertos, XP ganho, tempo, conquistas desbloqueadas

**Gamificação**
- XP por resposta correta (escala com dificuldade) + bônus de sessão perfeita
- Níveis com curva de progressão
- Streak diário (fuso horário do usuário; conta ao completar ≥1 quiz no dia)
- Meta diária de XP configurável
- Conquistas/medalhas (streaks, volume, precisão, cobertura de categorias)

**Revisão inteligente**
- Repetição espaçada (SM-2): perguntas erradas voltam mais cedo; acertadas, mais tarde
- Fila "Revisões de hoje" no dashboard

**Dashboard**
- XP total, nível e progresso para o próximo nível
- Streak atual e recorde
- Meta diária (anel de progresso)
- Taxa de acerto geral e total de perguntas respondidas
- Tempo estudado
- Gráfico de evolução (XP/dia, últimos 30 dias)
- Desempenho por categoria
- Últimos quizzes
- Recomendações de estudo (categorias fracas + revisões pendentes)

**Banco de perguntas**
- Meta: 400–600 perguntas curadas no lançamento, crescendo continuamente
- Seeds versionados no repositório (JSON), com validação automática de schema
- Campos obrigatórios: pergunta, resposta correta, explicação, referência (livro/cap/vers),
  tema, dificuldade, categoria, subcategoria, tags, nota de divergência (quando aplicável)

### 3.2 Fase 2 (pós-MVP)

- Ranking global e entre amigos
- Perfil público e compartilhamento de progresso
- Painel admin para curadoria de perguntas
- Desafios semanais/temáticos
- Ligas (estilo Duolingo)

### 3.3 Fase 3 (futuro)

- Apps iOS/Android (React Native, consumindo a mesma API)
- Modo multiplayer (duelos em tempo real)
- Offline mode + sincronização
- Push notifications (lembrete de streak)
- Trilhas de estudo guiadas (ex: "Panorama do AT em 30 dias")

## 4. Categorias (23)

Personagens · Livros da Bíblia · Geografia Bíblica · Reis · Profetas · Evangelhos ·
Cartas · Milagres · Parábolas · Doutrinas · Escatologia · História de Israel ·
História da Igreja · Cronologia Bíblica · Organização da Bíblia · Eventos Bíblicos ·
Teologia Bíblica · Contexto Histórico · Costumes Judaicos · Genealogias ·
Festas Judaicas · Idiomas Bíblicos · Cultura Bíblica

> "História da Igreja" e partes de "Contexto Histórico" são extrabíblicas por natureza —
> as perguntas dessas categorias indicam a fonte (ex: "segundo a tradição patrística…").

## 5. Dificuldades

| Nível | Público-alvo | Acerto | Erro |
|---|---|---|---|
| Fácil | Novo convertido / frequentador regular | +10 XP | −5 XP |
| Médio | Estudante da Palavra | +20 XP | −10 XP |
| Difícil | Professor de EBD / líder | +35 XP | −17 XP |
| Especialista | Seminarista / pastor | +50 XP | −25 XP |

## 6. Regras de gamificação

- **XP:** resposta correta = XP base da dificuldade; resposta errada = **−50% do valor
  da pergunta**; sessão perfeita = +10; completar sessão = +5. O saldo de uma sessão pode
  ser negativo (errar mais do que acertar reduz o XP total), mas o XP acumulado do
  usuário nunca cai abaixo de zero.
- **Nível:** curva de custo crescente — para subir do nível *n* para *n+1* são necessários
  `100 + (n − 1) × 50` XP (nível 1→2: 100 XP; 2→3: 150 XP; 3→4: 200 XP; …). Sem teto.
- **Fila inteligente de perguntas:** perguntas nunca respondidas vêm primeiro (em ordem
  aleatória); depois as respondidas errado; as respondidas corretamente vão para o fim
  da fila — quanto mais acertos consecutivos (repetições do SRS), mais tarde reaparecem.
- **Streak:** incrementa no primeiro quiz completado do dia (data no fuso do usuário);
  quebra se um dia inteiro passar sem atividade. Recorde é registrado.
- **Meta diária:** padrão 50 XP/dia, configurável (20/50/100/150).
- **Revisão (SM-2):** cada pergunta respondida vira um item de revisão com fator de
  facilidade, intervalo e data de vencimento. Errou → intervalo reseta.

## 7. Experiência (UX)

- **Tom:** paz, simplicidade, crescimento, excelência, modernidade — sem estética
  "religiosa" datada. Referências: Duolingo (gamificação, cor, microinterações) e
  Notion (clareza, hierarquia, respiro).
- **Sessões curtas:** quiz padrão de 10 perguntas (~5 min), configurável (5/10/15/20).
- **Feedback celebratório porém sóbrio:** animações suaves, sem infantilizar.
- **Mobile-first:** layout responsivo desde o dia 1 (prepara o terreno para o app).

## 8. Métricas de sucesso (North Stars)

1. **Dias ativos consecutivos** (streak médio) — mede o hábito
2. **Perguntas respondidas/semana** — mede o volume de estudo
3. **Taxa de acerto em revisões** — mede retenção real de conhecimento

## 9. Fora de escopo (por decisão)

- Leitura bíblica completa in-app (apenas citações nas explicações)
- Comentários/fórum entre usuários
- Conteúdo devocional autoral
