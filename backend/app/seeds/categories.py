from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category

# (slug, name, icon, description)
CATEGORIES: list[tuple[str, str, str, str]] = [
    ("personagens", "Personagens", "👤", "Homens e mulheres que marcaram a história bíblica"),
    ("livros-da-biblia", "Livros da Bíblia", "📚", "Autores, propósitos e conteúdo de cada livro"),
    (
        "geografia-biblica",
        "Geografia Bíblica",
        "🗺️",
        "Cidades, rios, montes e regiões das Escrituras",
    ),
    ("reis", "Reis", "👑", "Os reis de Israel, de Judá e das nações"),
    ("profetas", "Profetas", "📣", "Vida, mensagem e época dos profetas"),
    (
        "evangelhos",
        "Evangelhos",
        "✝️",
        "A vida e o ministério de Jesus em Mateus, Marcos, Lucas e João",
    ),
    ("cartas", "Cartas", "✉️", "As epístolas de Paulo e dos demais apóstolos"),
    ("milagres", "Milagres", "🌊", "As intervenções sobrenaturais de Deus na história"),
    ("parabolas", "Parábolas", "🌱", "As histórias que Jesus contou e seu significado"),
    ("doutrinas", "Doutrinas", "🏛️", "As grandes verdades da fé cristã"),
    ("escatologia", "Escatologia", "🕊️", "As últimas coisas: volta de Cristo, juízo e eternidade"),
    ("historia-de-israel", "História de Israel", "🇮🇱", "Da chamada de Abraão ao retorno do exílio"),
    ("historia-da-igreja", "História da Igreja", "⛪", "Dos apóstolos aos dias de hoje"),
    (
        "cronologia-biblica",
        "Cronologia Bíblica",
        "⏳",
        "A ordem dos eventos na linha do tempo bíblica",
    ),
    (
        "organizacao-da-biblia",
        "Organização da Bíblia",
        "🗂️",
        "Cânon, divisões e estrutura das Escrituras",
    ),
    (
        "eventos-biblicos",
        "Eventos Bíblicos",
        "⚡",
        "Os grandes acontecimentos da narrativa bíblica",
    ),
    (
        "teologia-biblica",
        "Teologia Bíblica",
        "📖",
        "Os grandes temas que atravessam toda a Escritura",
    ),
    (
        "contexto-historico",
        "Contexto Histórico",
        "🏺",
        "Impérios, governantes e o mundo dos tempos bíblicos",
    ),
    (
        "costumes-judaicos",
        "Costumes Judaicos",
        "🕎",
        "Práticas, leis e tradições do povo de Israel",
    ),
    ("genealogias", "Genealogias", "🌳", "As linhagens e famílias das Escrituras"),
    (
        "festas-judaicas",
        "Festas Judaicas",
        "🎺",
        "Páscoa, Pentecostes, Tabernáculos e as demais festas",
    ),
    (
        "idiomas-biblicos",
        "Idiomas Bíblicos",
        "🔤",
        "Hebraico, aramaico e grego: palavras e significados",
    ),
    (
        "cultura-biblica",
        "Cultura Bíblica",
        "🫒",
        "Agricultura, pesos, moedas e o cotidiano bíblico",
    ),
]


def seed_categories(db: Session) -> dict[str, int]:
    """Idempotent upsert; returns slug -> id."""
    existing = {c.slug: c for c in db.scalars(select(Category))}
    for order, (slug, name, icon, description) in enumerate(CATEGORIES):
        category = existing.get(slug)
        if category is None:
            category = Category(slug=slug)
            db.add(category)
        category.name = name
        category.icon = icon
        category.description = description
        category.display_order = order
    db.flush()
    return {c.slug: c.id for c in db.scalars(select(Category))}
