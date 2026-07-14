# Mavva — Roadmap

## MVP — Fase 1 (agora)

**Meta: usar o Mavva todos os dias, sozinho, com prazer.**

- [x] Documentação: PRD, arquitetura, banco, API, frontend
- [ ] Infra: monorepo, Docker/docker-compose, CI, pre-commit, lint/format
- [ ] Backend: auth (JWT + refresh + reset de senha), quiz, correção aberta,
      gamificação (XP/nível/streak/meta), SRS, dashboard, conquistas
- [ ] Seeds: 23 categorias, conquistas, banco de perguntas (meta 400–600 curadas)
- [ ] Frontend: login/cadastro/recuperação, dashboard completo, fluxo de quiz,
      revisão, conquistas, perfil
- [ ] Deploy: Vercel (front) + Render (API) + Neon (Postgres) + Resend (e-mail)

**Critérios de pronto do MVP:**
1. Fluxo completo: cadastrar → configurar quiz → responder → ver XP/streak no dashboard
2. Streak sobrevive a virada de dia no fuso do usuário (testado)
3. Perguntas erradas reaparecem na revisão no dia seguinte
4. CI verde: lint + types + testes + build + validação de conteúdo

## Fase 2 — Consolidação

- Painel admin de curadoria (CRUD de perguntas, fila de revisão editorial)
- Expansão do banco: 600 → 2000+ perguntas
- Ranking global + ligas semanais
- Perfil público + compartilhamento de progresso (imagem OG do streak)
- Desafios temáticos (ex: "Semana dos Profetas")
- E2E com Playwright
- PWA (instalável, primeiro passo rumo ao offline)

## Fase 3 — Expansão

- App iOS/Android (React Native/Expo, consumindo `/api/v1`; auth por refresh no corpo)
- Push notifications (lembrete de streak, revisões vencendo)
- Offline mode com fila de sincronização (IDs UUID já preparam isso)
- Multiplayer: duelos em tempo real (WebSocket)
- Ranking entre amigos
- Trilhas guiadas de estudo ("Panorama do AT", "Vida de Cristo")

## Débitos assumidos conscientemente no MVP

| Débito | Quando pagar |
|---|---|
| Cold start do Render free (~30 s) | Fase 2, se incomodar (Railway/Fly ~US$5/mês) |
| Sem painel admin (curadoria via git) | Fase 2 |
| Refresh token só via cookie (web) | Fase 3, junto com o app mobile |
| Gráficos com recharts (bundle ~90 KB) | Se o bundle pesar, trocar por SVG próprio |
