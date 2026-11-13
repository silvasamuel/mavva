from enum import StrEnum


class UserRole(StrEnum):
    USER = "user"
    ADMIN = "admin"


class ReviewSpacing(StrEnum):
    INTENSIVE = "intensive"
    BALANCED = "balanced"
    RELAXED = "relaxed"


class ReviewScope(StrEnum):
    ALL = "all"
    MISTAKES = "mistakes"


class ReviewOrder(StrEnum):
    OLDEST = "oldest"
    LAPSES = "lapses"


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
    LEAGUE = "league"  # a league round or cup match (see services/league_service.py)


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


class AppSuggestionKind(StrEnum):
    FEATURE = "feature"
    CORRECTION = "correction"


class AppSuggestionStatus(StrEnum):
    OPEN = "open"
    REVIEWED = "reviewed"  # read, nothing to credit
    ACCEPTED = "accepted"  # taken on board: counts toward the contributor seal


class AnnouncementKind(StrEnum):
    FEATURE = "feature"
    IMPROVEMENT = "improvement"
    FIX = "fix"
    NOTICE = "notice"


class SupportPaymentStatus(StrEnum):
    PENDING = "pending"  # Pix issued, waiting for the transfer
    APPROVED = "approved"  # money received
    EXPIRED = "expired"  # nobody paid before the deadline
    CANCELLED = "cancelled"  # refused, refunded or charged back by the provider


class LeagueFormat(StrEnum):
    POINTS = "points"  # everyone plays every round; most points wins
    CUP = "cup"  # knockout bracket of 1v1 matches


class LeagueStatus(StrEnum):
    RECRUITING = "recruiting"  # owner is inviting; nothing to play yet
    ACTIVE = "active"  # started: fixtures drawn, no more joining
    FINISHED = "finished"  # has a champion
    INCOMPLETE = "incomplete"  # the end date came first (never started, or cup not played out)


class LeagueMemberStatus(StrEnum):
    INVITED = "invited"
    ACTIVE = "active"
    DECLINED = "declined"
    LEFT = "left"
