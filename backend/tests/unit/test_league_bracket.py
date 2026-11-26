"""The cup draw: a full bracket, one final, and a match for third place."""

import uuid

import pytest

from app.services.league_service import CUP_SIZES, build_bracket, cup_size_message


def _bracket(count: int):
    players = [uuid.uuid4() for _ in range(count)]
    matches = build_bracket(players, lambda: ["q"])
    return players, matches


def _title_matches(matches):
    return [m for m in matches if not m.third_place]


@pytest.mark.parametrize("count", CUP_SIZES)
def test_every_round_pairs_everyone_left(count: int) -> None:
    players, matches = _bracket(count)
    title = _title_matches(matches)
    first = [m for m in title if m.round == 1]
    seated = [p for m in first for p in (m.player_a_id, m.player_b_id)]
    assert sorted(seated, key=str) == sorted(players, key=str)

    # Halving every round, down to a single final: no byes anywhere.
    size, round_number = count // 2, 1
    while size >= 1:
        assert len([m for m in title if m.round == round_number]) == size
        size, round_number = size // 2, round_number + 1
    # A knockout with N players takes N - 1 matches for the title.
    assert len(title) == count - 1


@pytest.mark.parametrize("count", [3, 5, 6, 7, 10, 12, 14, 18, 20])
def test_other_sizes_do_not_close_a_bracket(count: int) -> None:
    with pytest.raises(ValueError):
        _bracket(count)
    assert "2, 4, 8 ou 16 jogadores" in cup_size_message(count)


def test_the_message_points_to_the_nearest_sizes() -> None:
    assert cup_size_message(6).endswith("Com 6, convide mais 2 ou remova 2.")
    assert cup_size_message(3).endswith("Com 3, convide mais 1 ou remova 1.")
    # Past 16 the only way is down: a league holds 20 players at most.
    assert cup_size_message(18).endswith("Com 18, remova 2.")


@pytest.mark.parametrize("count", CUP_SIZES)
def test_each_title_match_feeds_exactly_one_later_match(count: int) -> None:
    _, matches = _bracket(count)
    title = _title_matches(matches)
    by_id = {m.id: m for m in title}
    feeds = {m.id: 0 for m in title}
    for match in title:
        for feeder_id in (match.feeder_a_id, match.feeder_b_id):
            if feeder_id is not None:
                assert by_id[feeder_id].round == match.round - 1
                feeds[feeder_id] += 1
        # Each seat is a player or a feeder, never both, never neither.
        assert (match.player_a_id is None) != (match.feeder_a_id is None)
        assert (match.player_b_id is None) != (match.feeder_b_id is None)
    final = max(title, key=lambda m: m.round)
    assert feeds.pop(final.id) == 0
    assert set(feeds.values()) <= {1}


@pytest.mark.parametrize("count", [4, 8, 16])
def test_the_semifinal_losers_play_for_third_place(count: int) -> None:
    _, matches = _bracket(count)
    third = [m for m in matches if m.third_place]
    assert len(third) == 1
    final = max(_title_matches(matches), key=lambda m: m.round)
    semifinals = {m.id for m in matches if m.round == final.round - 1}
    # Same round as the final, right beside it, fed by both semifinals.
    assert (third[0].round, third[0].position) == (final.round, 2)
    assert {third[0].feeder_a_id, third[0].feeder_b_id} == semifinals
    assert third[0].player_a_id is None and third[0].player_b_id is None


def test_two_players_are_just_a_final() -> None:
    _, matches = _bracket(2)
    assert len(matches) == 1
    assert not matches[0].third_place


def test_positions_number_the_matches_inside_each_round() -> None:
    _, matches = _bracket(8)
    for round_number in (1, 2, 3):
        positions = [m.position for m in matches if m.round == round_number]
        assert positions == list(range(1, len(positions) + 1))
