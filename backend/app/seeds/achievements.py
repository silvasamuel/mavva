from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Achievement

# (code, name, icon, description, criteria)
ACHIEVEMENTS: list[tuple[str, str, str, str, dict[str, Any]]] = [
    (
        "streak_3",
        "Três dias no caminho",
        "🔥",
        "Estude por 3 dias seguidos",
        {"type": "streak", "value": 3},
    ),
    (
        "streak_7",
        "Uma semana no deserto",
        "🏕️",
        "Estude por 7 dias seguidos",
        {"type": "streak", "value": 7},
    ),
    (
        "streak_30",
        "Constância de Daniel",
        "🦁",
        "Estude por 30 dias seguidos",
        {"type": "streak", "value": 30},
    ),
    (
        "streak_100",
        "Perseverança dos santos",
        "💎",
        "Estude por 100 dias seguidos",
        {"type": "streak", "value": 100},
    ),
    (
        "correct_10",
        "Primeiros passos",
        "👣",
        "Acerte 10 perguntas",
        {"type": "total_correct", "value": 10},
    ),
    (
        "correct_50",
        "Escriba iniciante",
        "✍️",
        "Acerte 50 perguntas",
        {"type": "total_correct", "value": 50},
    ),
    (
        "correct_250",
        "Escriba dedicado",
        "📜",
        "Acerte 250 perguntas",
        {"type": "total_correct", "value": 250},
    ),
    (
        "correct_1000",
        "Doutor da Lei",
        "🎓",
        "Acerte 1000 perguntas",
        {"type": "total_correct", "value": 1000},
    ),
    (
        "answered_100",
        "Cem degraus",
        "🪜",
        "Responda 100 perguntas",
        {"type": "questions_answered", "value": 100},
    ),
    (
        "answered_500",
        "Quinhentos degraus",
        "🏔️",
        "Responda 500 perguntas",
        {"type": "questions_answered", "value": 500},
    ),
    (
        "perfect_1",
        "Sessão perfeita",
        "⭐",
        "Complete um quiz sem errar",
        {"type": "perfect_sessions", "value": 1},
    ),
    (
        "perfect_10",
        "Ouro refinado",
        "🌟",
        "Complete 10 quizzes sem errar",
        {"type": "perfect_sessions", "value": 10},
    ),
    ("level_5", "Raízes profundas", "🌿", "Alcance o nível 5", {"type": "level", "value": 5}),
    ("level_10", "Árvore frutífera", "🌳", "Alcance o nível 10", {"type": "level", "value": 10}),
    ("xp_1000", "Mil pães", "🍞", "Acumule 1000 XP", {"type": "total_xp", "value": 1000}),
    ("xp_5000", "Celeiro cheio", "🌾", "Acumule 5000 XP", {"type": "total_xp", "value": 5000}),
    (
        "categories_all",
        "Explorador da Palavra",
        "🧭",
        "Responda perguntas de todas as categorias",
        {"type": "categories_covered"},
    ),
]


def seed_achievements(db: Session) -> None:
    existing = {a.code: a for a in db.scalars(select(Achievement))}
    for code, name, icon, description, criteria in ACHIEVEMENTS:
        achievement = existing.get(code)
        if achievement is None:
            achievement = Achievement(code=code)
            db.add(achievement)
        achievement.name = name
        achievement.icon = icon
        achievement.description = description
        achievement.criteria = criteria
    db.flush()
