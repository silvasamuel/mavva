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
    DUEL = "duel"


class FriendshipStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    BLOCKED = "blocked"


class DuelMode(StrEnum):
    RANDOM = "random"
    FRIEND = "friend"


class DuelStatus(StrEnum):
    OPEN = "open"  # random duel waiting in the matchmaking queue
    ACTIVE = "active"  # both players in; at least one round unfinished
    FINISHED = "finished"  # resolved (winner or draw)
    EXPIRED = "expired"  # nobody joined before the deadline
    CANCELLED = "cancelled"  # someone walked out mid-duel (forfeit)


class QuestionFlagReason(StrEnum):
    WRONG_TEXT = "wrong_text"
    WRONG_ANSWER = "wrong_answer"
    WRONG_REFERENCE = "wrong_reference"
    OTHER = "other"


class QuestionFlagStatus(StrEnum):
    OPEN = "open"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class QuestionProposalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
