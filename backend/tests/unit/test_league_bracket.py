"""The cup draw: every player in round 1, byes spread, one final."""

import uuid

import pytest

from app.services.league_service import build_bracket


def _bracket(count: int):
    players = [uuid.uuid4() for _ in range(count)]
    matches = build_bracket(players, lambda: ["q"])
    return players, matches


@pytest.mark.parametrize("count", [2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
def test_everyone_plays_round_one_and_there_is_one_final(count: int) -> None:
    players, matches = _bracket(count)
    first = [m for m in matches if m.round == 1]
    assert len(first) == count // 2
    seated = [p for m in first for p in (m.player_a_id, m.player_b_id)]
    assert sorted(seated, key=str) == sorted(players, key=str)

    last_round = max(m.round for m in matches)
    assert len([m for m in matches if m.round == last_round]) == 1
    # A knockout with N players always takes N - 1 matches.
    assert len(matches) == count - 1


@pytest.mark.parametrize("count", [2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
def test_every_match_but_the_final_feeds_exactly_one_later_match(count: int) -> None:
    _, matches = _bracket(count)
    by_id = {m.id: m for m in matches}
    feeds: dict[uuid.UUID, int] = {m.id: 0 for m in matches}
    for match in matches:
        for feeder_id in (match.feeder_a_id, match.feeder_b_id):
            if feeder_id is not None:
                assert by_id[feeder_id].round < match.round
                feeds[feeder_id] += 1
        # Each seat is a player or a feeder, never both, never neither.
        assert (match.player_a_id is None) != (match.feeder_a_id is None)
        assert (match.player_b_id is None) != (match.feeder_b_id is None)
    final = max(matches, key=lambda m: m.round)
    assert feeds.pop(final.id) == 0
    # (With two players the final is the only match, so nothing is left.)
    assert set(feeds.values()) <= {1}


def test_six_players_one_rests_in_round_two() -> None:
    _, matches = _bracket(6)
    rounds = [[m for m in matches if m.round == r] for r in (1, 2, 3)]
    assert [len(r) for r in rounds] == [3, 1, 1]
    semi, final = rounds[1][0], rounds[2][0]
    assert {semi.feeder_a_id, semi.feeder_b_id} == {rounds[0][0].id, rounds[0][1].id}
    # The third winner rested in round 2 and meets the semi's winner in the final.
    assert {final.feeder_a_id, final.feeder_b_id} == {rounds[0][2].id, semi.id}


def test_the_same_seat_never_rests_twice_in_a_row() -> None:
    _, matches = _bracket(10)
    by_id = {m.id: m for m in matches}
    for match in matches:
        for feeder_id in (match.feeder_a_id, match.feeder_b_id):
            if feeder_id is not None:
                # Resting one round is allowed; skipping two would be a double bye.
                assert match.round - by_id[feeder_id].round <= 2


def test_positions_number_the_matches_inside_each_round() -> None:
    _, matches = _bracket(8)
    for round_number in (1, 2, 3):
        positions = [m.position for m in matches if m.round == round_number]
        assert positions == list(range(1, len(positions) + 1))
