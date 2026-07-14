from fastapi import APIRouter

from app.api.v1 import achievements, auth, catalog, dashboard, quizzes, users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(catalog.router)
api_router.include_router(quizzes.router)
api_router.include_router(dashboard.router)
api_router.include_router(achievements.router)
