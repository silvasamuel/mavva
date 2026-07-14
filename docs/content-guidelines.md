# Mavva — Diretrizes Editoriais do Banco de Perguntas

Estas regras valem para **toda** pergunta que entra em `content/questions/`.
O seed valida o schema automaticamente; a curadoria teológica é humana (Samuel).

## 1. Fundamentação

1. **Toda pergunta tem referência bíblica verificável** (livro, capítulo, versículo[s]).
   A explicação deve se sustentar no texto citado.
2. **Tradução base: ARC** (Almeida Revista e Corrigida — domínio público).
   Citações de versículos nas explicações usam ARC.
3. **Tradição ≠ Escritura.** Perguntas de História da Igreja, Contexto Histórico ou
   costumes extrabíblicos devem dizer a fonte no enunciado ou na explicação
   ("segundo a tradição…", "segundo Josefo…", "segundo os historiadores…").
   Nesses casos `divergence_note` ou a explicação deixa claro o que é bíblico e o que não é.
4. **Divergências interpretativas são indicadas, não arbitradas.** Temas onde
   tradições cristãs ortodoxas divergem (escatologia — pré/pós/amilenismo;
   batismo; dons espirituais; Calvinismo × Arminianismo) recebem `divergence_note`
   apresentando as principais posições com honestidade. A resposta "correta" nesses
   casos deve ser factual sobre o texto ("o que o texto diz"), nunca sobre qual
   interpretação é a certa.
5. **Sem denominacionalismo no gabarito.** O Mavva serve à Igreja; a resposta correta
   nunca depende de aceitar uma posição denominacional específica.

## 2. Qualidade das perguntas

- **Enunciado autossuficiente:** entendível sem contexto externo. Evitar "No capítulo
  que lemos…".
- **Múltipla escolha:** 4 alternativas plausíveis do mesmo domínio (distratores reais,
  não absurdos), exatamente 1 correta, sem "todas as anteriores"/"nenhuma das anteriores".
- **Resposta aberta:** respostas curtas (1–4 palavras — nomes, lugares, números).
  Listar todas as variações aceitáveis em `accepted_answers` ("Pedro", "Simão Pedro",
  "Cefas"). Nunca usar resposta aberta para conceitos que exigem frase.
- **Explicação ensina, não só confirma:** 2–4 frases; dá o contexto, cita o versículo
  quando agrega e aponta uma conexão bíblica maior quando natural.
- **Dificuldade honesta:**
  - *Fácil:* histórias célebres e conhecimento de EBD (arca de Noé, os 12 apóstolos)
  - *Médio:* detalhes do texto (quem era o rei quando Isaías foi chamado)
  - *Difícil:* conexões e personagens secundários (genealogias, reis divididos)
  - *Especialista:* nível seminário (cronologia, idiomas originais, crítica textual básica)

## 3. Formato do arquivo (JSON)

Um arquivo por categoria: `content/questions/<categoria>.json`.

```jsonc
{
  "category": "personagens",
  "questions": [
    {
      "external_id": "personagens-0001",        // único, imutável, sequencial por categoria
      "type": "multiple_choice",                 // ou "open_answer"
      "text": "Quem intercedeu junto a Davi para impedi-lo de derramar sangue, tornando-se depois sua esposa?",
      "options": [                               // só p/ multiple_choice: 4 itens, 1 correct
        { "text": "Abigail", "correct": true },
        { "text": "Mical", "correct": false },
        { "text": "Bate-Seba", "correct": false },
        { "text": "Ainoã", "correct": false }
      ],
      "accepted_answers": null,                  // só p/ open_answer: ["Abigail"]
      "explanation": "Abigail, mulher de Nabal, saiu ao encontro de Davi com provisões e o convenceu a não se vingar. Após a morte de Nabal, Davi a tomou por esposa (1Sm 25:32-42).",
      "divergence_note": null,
      "reference": { "book": "1samuel", "chapter": 25, "verse_start": 23, "verse_end": 35 },
      "theme": "Sabedoria",
      "difficulty": "medium",              // easy | medium | hard | expert
      "subcategory": "Mulheres da Bíblia",
      "tags": ["davi", "abigail", "nabal"]
    }
  ]
}
```

Validações automáticas do seed (falha = CI vermelho):
- `external_id` único global e prefixado pela categoria do arquivo
- `book` existe no catálogo dos 66 livros; `chapter ≥ 1`; `verse_start ≥ 1`;
  `verse_end ≥ verse_start` quando presente
- `multiple_choice`: exatamente 4 opções e exatamente 1 correta
- `open_answer`: `accepted_answers` com ≥1 item, todos não vazios
- `explanation` não vazia; `difficulty` e demais enums válidos

## 4. Distribuição-alvo do banco inicial (400–600)

- Cobertura: **todas as 23 categorias** com ≥10 perguntas cada
- Dificuldade: ~45% fácil · 30% médio · 15% difícil · 10% especialista
- Tipo: ~75% múltipla escolha · 25% resposta aberta
- Testamento: ~55% AT · 45% NT (proporcional ao volume das Escrituras, com reforço em Evangelhos)
