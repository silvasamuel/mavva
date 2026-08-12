from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User, UserAchievement
from app.seeds.achievements import xp_reward_for
from app.services.achievement_service import evaluate_achievements
from app.services.auth_service import register_user
from app.services.gamification import level_from_total_xp


def _user_with_stats(db: Session, **stats_fields: int) -> User:
    user = register_user(db, "Ana", "ana-achievements@teste.com", "senha-forte-123")
    for key, value in stats_fields.items():
        setattr(user.stats, key, value)
    if "total_xp" in stats_fields:
        user.stats.level, _, _ = level_from_total_xp(user.stats.total_xp)
    db.flush()
    return user


class TestAchievementXp:
    def test_unlocking_pays_the_seeded_reward(self, db: Session):
        user = _user_with_stats(db, perfect_sessions=1)
        unlocked = evaluate_achievements(db, user, user.stats)
        codes = {a.code for a in unlocked}
        assert "perfect_1" in codes
        assert user.stats.total_xp == xp_reward_for("perfect_1")

    def test_already_unlocked_does_not_pay_again(self, db: Session):
        user = _user_with_stats(db, perfect_sessions=1)
        evaluate_achievements(db, user, user.stats)
        db.flush()
        xp_after_first = user.stats.total_xp
        again = evaluate_achievements(db, user, user.stats)
        assert again == []
        assert user.stats.total_xp == xp_after_first
        assert db.scalar(select(func.count()).select_from(UserAchievement)) == 1

    def test_badge_xp_can_cascade_into_xp_milestones(self, db: Session):
        # Already level 5 (unlocks that badge) but shy of 1000 XP. The level_5
        # reward pushes the total over 1000, which then pays xp_1000.
        user = _user_with_stats(db, total_xp=980)
        unlocked = evaluate_achievements(db, user, user.stats)
        codes = {a.code for a in unlocked}
        assert "level_5" in codes
        assert "xp_1000" in codes
        assert user.stats.total_xp == 980 + xp_reward_for("level_5") + xp_reward_for("xp_1000")
