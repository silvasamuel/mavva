from enum import StrEnum


class UserRole(StrEnum):
    USER = "user"
    ADMIN = "admin"


class QuestionType(StrEnum):
    MULTIPLE_CHOICE = "multiple_choice"
    OPEN_ANSWER = "open_answer"


class Testament(StrEnum):
    OLD = "old"
    NEW = "new"


class Difficulty(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    EXPERT = "expert"


class QuizMode(StrEnum):
    PRACTICE = "practice"
    REVIEW = "review"
