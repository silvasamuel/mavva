# Semente do Mavva (Rive)

Fonte da mascote animada. O app usa o arquivo gerado
`frontend/src/assets/mascot/semente.riv`.

- `gen.py` gera `scene.rml` (o documento Rive em texto). Edite o gerador, não o `.rml`.
- `rive.yaml` liga o projeto ao arquivo no editor do Rive (`push`/`pull`).

## Fluxo

Requer o [Rive CLI](https://rive.app/cli).

```bash
cd frontend/rive/semente
python3 gen.py && rive . --verify        # gera e valida
rive inspect . --summary                 # "problems" tem que vir vazio
rive . --once                            # escreve build/semente-mavva.riv
cp build/semente-mavva.riv ../../src/assets/mascot/semente.riv
```

Para ver uma reação parada num quadro (as capturas não disparam gatilhos):

```bash
START=happy python3 gen.py && rive . --screenshot=happy.png --advance=26
LOOKX=100 LOOKY=50 python3 gen.py && rive . --screenshot=direita.png --advance=2
python3 gen.py   # volte ao normal antes de gerar o .riv
```

## Editor do Rive

`rive push --yes --name="..."` envia para o arquivo ligado em `rive.yaml`
(precisa de `rive login`). Se alguém ajustar algo no editor, traga a mudança
para o `gen.py` antes do próximo push, senão ela é sobrescrita. Para comparar:
`rive create tmp --from-remote-file=<id>` e `rive inspect` nos dois.

Todo elemento tem id fixo (os sem id explícito recebem um derivado do caminho,
em `with_stable_ids`). Isso importa: o push casa objetos por id, e ids
sequenciais faziam um item removido bagunçar o resto do arquivo no editor.

## O que a state machine `Mascot` oferece

| Entrada | Tipo | Efeito |
|---|---|---|
| `correct` | gatilho | pula, olhos ^^, boca aberta, estrelinhas |
| `wrong` | gatilho | encolhe, olha para baixo, bico, folhas murcham |
| `celebrate` | gatilho | dois pulos acenando, chuva de estrelas |
| `lookX` / `lookY` | número 0–100 | para onde olha (50 = frente) |

Em repouso ela respira, balança broto e braços e pisca (simples e dupla).

## Imagem parada

`src/assets/mascot/semente.png` (logo antes da animação carregar) e os ícones em
`public/` saíram de uma captura transparente do editor (`capture_artboard`),
recortada para o quadro `x 60–340, y 118–468` do artboard, o mesmo usado no
`Layout` de `SeedMascotCanvas`. Refaça-os se o visual em repouso mudar.
