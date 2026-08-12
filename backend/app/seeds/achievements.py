from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Achievement

# (code, name, icon, description, criteria, xp_reward)
# Rewards scale with rarity: firsts ~20-25, mid milestones ~50-150, legends 200-400.
ACHIEVEMENTS: list[tuple[str, str, str, str, dict[str, Any], int]] = [
    (
        "streak_3",
        "Três dias no caminho",
        "🔥",
        "Estude por 3 dias seguidos",
        {"type": "streak", "value": 3},
        20,
    ),
    (
        "streak_7",
        "Uma semana no deserto",
        "🏕️",
        "Estude por 7 dias seguidos",
        {"type": "streak", "value": 7},
        50,
    ),
    (
        "streak_30",
        "Constância de Daniel",
        "🦁",
        "Estude por 30 dias seguidos",
        {"type": "streak", "value": 30},
        150,
    ),
    (
        "streak_100",
        "Perseverança dos santos",
        "💎",
        "Estude por 100 dias seguidos",
        {"type": "streak", "value": 100},
        400,
    ),
    (
        "correct_10",
        "Primeiros passos",
        "👣",
        "Acerte 10 perguntas",
        {"type": "total_correct", "value": 10},
        20,
    ),
    (
        "correct_50",
        "Escriba iniciante",
        "✍️",
        "Acerte 50 perguntas",
        {"type": "total_correct", "value": 50},
        50,
    ),
    (
        "correct_250",
        "Escriba dedicado",
        "📜",
        "Acerte 250 perguntas",
        {"type": "total_correct", "value": 250},
        150,
    ),
    (
        "correct_1000",
        "Doutor da Lei",
        "🎓",
        "Acerte 1000 perguntas",
        {"type": "total_correct", "value": 1000},
        400,
    ),
    (
        "answered_100",
        "Cem degraus",
        "🪜",
        "Responda 100 perguntas",
        {"type": "questions_answered", "value": 100},
        40,
    ),
    (
        "answered_500",
        "Quinhentos degraus",
        "🏔️",
        "Responda 500 perguntas",
        {"type": "questions_answered", "value": 500},
        150,
    ),
    (
        "perfect_1",
        "Sessão perfeita",
        "⭐",
        "Complete um quiz sem errar",
        {"type": "perfect_sessions", "value": 1},
        25,
    ),
    (
        "perfect_10",
        "Ouro refinado",
        "🌟",
        "Complete 10 quizzes sem errar",
        {"type": "perfect_sessions", "value": 10},
        100,
    ),
    ("level_5", "Raízes profundas", "🌿", "Alcance o nível 5", {"type": "level", "value": 5}, 50),
    (
        "level_10",
        "Árvore frutífera",
        "🌳",
        "Alcance o nível 10",
        {"type": "level", "value": 10},
        150,
    ),
    ("xp_1000", "Mil pães", "🍞", "Acumule 1000 XP", {"type": "total_xp", "value": 1000}, 50),
    ("xp_5000", "Celeiro cheio", "🌾", "Acumule 5000 XP", {"type": "total_xp", "value": 5000}, 200),
    (
        "categories_all",
        "Explorador da Palavra",
        "🧭",
        "Responda perguntas de todas as categorias",
        {"type": "categories_covered"},
        200,
    ),
    # --- Duels ---
    (
        "duel_win_1",
        "Pedra e funda",
        "🪨",
        "Vença o seu primeiro duelo",
        {"type": "duel_wins", "value": 1},
        25,
    ),
    (
        "duel_win_10",
        "Valente de Davi",
        "⚔️",
        "Vença 10 duelos",
        {"type": "duel_wins", "value": 10},
        100,
    ),
    (
        "duel_win_50",
        "Campeão de Israel",
        "🛡️",
        "Vença 50 duelos",
        {"type": "duel_wins", "value": 50},
        300,
    ),
    (
        "duel_streak_3",
        "Cordão de três dobras",
        "🧵",
        "Vença 3 duelos seguidos",
        {"type": "duel_streak", "value": 3},
        50,
    ),
    (
        "duel_streak_10",
        "Invicto",
        "👑",
        "Vença 10 duelos seguidos",
        {"type": "duel_streak", "value": 10},
        200,
    ),
    (
        "duel_played_25",
        "Veterano da arena",
        "🏟️",
        "Dispute 25 duelos",
        {"type": "duels_played", "value": 25},
        75,
    ),
    (
        "duel_flawless_1",
        "Vitória impecável",
        "💯",
        "Vença um duelo acertando todas as perguntas",
        {"type": "duel_flawless_wins", "value": 1},
        50,
    ),
    (
        "duel_flawless_5",
        "Domínio absoluto",
        "🌟",
        "Vença 5 duelos sem errar nenhuma",
        {"type": "duel_flawless_wins", "value": 5},
        200,
    ),
]


def xp_reward_for(code: str) -> int:
    for item in ACHIEVEMENTS:
        if item[0] == code:
            return item[5]
    raise KeyError(code)


def seed_achievements(db: Session) -> None:
    existing = {a.code: a for a in db.scalars(select(Achievement))}
    for code, name, icon, description, criteria, xp_reward in ACHIEVEMENTS:
        achievement = existing.get(code)
        if achievement is None:
            achievement = Achievement(code=code)
            db.add(achievement)
        achievement.name = name
        achievement.icon = icon
        achievement.description = description
        achievement.criteria = criteria
        achievement.xp_reward = xp_reward
    db.flush()
