from fastapi import APIRouter

from app.api.v1 import (
    achievements,
    admin,
    auth,
    catalog,
    cron,
    dashboard,
    moderation,
    notifications,
    quizzes,
    ranking,
    social,
    support,
    users,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(catalog.router)
api_router.include_router(quizzes.router)
api_router.include_router(dashboard.router)
api_router.include_router(achievements.router)
api_router.include_router(social.friends_router)
api_router.include_router(social.duels_router)
api_router.include_router(social.players_router)
api_router.include_router(ranking.router)
api_router.include_router(moderation.router)
api_router.include_router(notifications.router)
api_router.include_router(support.router)
api_router.include_router(admin.router)
api_router.include_router(cron.router)
