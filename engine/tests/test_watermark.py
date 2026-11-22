"""Tests for the v1 keyed tournament sampler scaffolding.

The sampler is not wired into the codec yet; these tests pin the contract the
future encoder and detector will rely on.
"""

from __future__ import annotations

import random

import pytest

from tracedna.config import CONTEXT_LEN, TOURNAMENT_DEPTH
from tracedna.watermark import (
    context_seed,
    derive_key,
    g_value,
    score_sequence,
    tournament_choice,
)

ALICE_KEY = derive_key("alice")
BOB_KEY = derive_key("bob")


def _tournament_sequence(
    rng: random.Random,
    key: bytes,
    recipient: str,
    length: int = 200,
) -> str:
    """Generate a v1-watermarked sequence.

    At each position we model the generative encoder by sampling four candidate
    bases from the uniform distribution, then let the tournament reweight them.
    Candidate sampling is essential: ``tournament_choice`` over a fixed
    four-base candidate list is deterministic, so feeding its output straight
    back as context would produce a periodic sequence rather than a sample from
    a reweighted distribution.
    """
    sequence = [rng.choice("ACGT") for _ in range(CONTEXT_LEN)]
    while len(sequence) < length:
        context = "".join(sequence[-CONTEXT_LEN:])
        seed = context_seed(key, recipient, context)
        candidates = [rng.choice("ACGT") for _ in range(4)]
        sequence.append(tournament_choice(candidates, seed))
    return "".join(sequence)


def test_context_seed_is_position_independent() -> None:
    """The same local context gives the same seed wherever it occurs."""
    sequence = "TTTTGATTCCCCGATTAAAA"
    contexts = [sequence[i : i + CONTEXT_LEN] for i in range(len(sequence) - CONTEXT_LEN + 1)]
    seeds = [context_seed(ALICE_KEY, "alice", context) for context in contexts]

    assert contexts[4] == contexts[12] == "GATT"
    assert seeds[4] == seeds[12]

    # Only the trailing CONTEXT_LEN bases matter, and case is normalised.
    assert context_seed(ALICE_KEY, "alice", "GATT") == seeds[4]
    assert context_seed(ALICE_KEY, "alice", "AAAAGATT") == seeds[4]
    assert context_seed(ALICE_KEY, "alice", "ccccgatt") == seeds[4]


def test_context_seed_is_bound_to_key_and_recipient() -> None:
    context = "GATT"

    assert context_seed(ALICE_KEY, "alice", context) != context_seed(BOB_KEY, "alice", context)
    assert context_seed(ALICE_KEY, "alice", context) != context_seed(ALICE_KEY, "bob", context)
    assert context_seed(ALICE_KEY, "alice", context) != context_seed(ALICE_KEY, "alice", "GATC")

    # Recipient names follow derive_key's normalisation.
    assert context_seed(ALICE_KEY, "Alice", context) == context_seed(ALICE_KEY, " alice ", context)


def test_g_value_is_binary_and_deterministic() -> None:
    seed = context_seed(ALICE_KEY, "alice", "GATT")
    observed: set[int] = set()

    for layer in range(TOURNAMENT_DEPTH):
        for base in "ACGT":
            value = g_value(seed, layer, base)
            assert value in (0, 1)
            assert value == g_value(seed, layer, base)
            observed.add(value)

    # A scoring function that is constant is not a scoring function.
    assert observed == {0, 1}


def test_g_value_rejects_bad_input() -> None:
    with pytest.raises(ValueError):
        g_value(-1, 0, "A")
    with pytest.raises(ValueError):
        g_value(1, -1, "A")
    with pytest.raises(ValueError):
        g_value(1, 0, "N")
    with pytest.raises(ValueError):
        g_value(1, 0, "AC")


def test_tournament_choice_always_returns_a_candidate() -> None:
    rng = random.Random(0x70)

    for _ in range(200):
        count = rng.randint(1, 4)
        candidates = [rng.choice("ACGT") for _ in range(count)]
        seed = rng.getrandbits(64)
        depth = rng.randint(1, TOURNAMENT_DEPTH)

        winner = tournament_choice(candidates, seed, depth)
        assert winner in candidates
        # Deterministic for identical inputs.
        assert winner == tournament_choice(candidates, seed, depth)


def test_tournament_choice_rejects_bad_input() -> None:
    with pytest.raises(ValueError):
        tournament_choice([], 1)
    with pytest.raises(ValueError):
        tournament_choice(["A"], 1, depth=0)
    with pytest.raises(ValueError):
        tournament_choice(["A", "AC"], 1)


def test_tournament_output_scores_above_uniform_random_dna() -> None:
    rng = random.Random(0x5C0E)
    watermarked = [
        score_sequence(_tournament_sequence(rng, ALICE_KEY, "alice"), ALICE_KEY, "alice")
        for _ in range(200)
    ]
    uniform = [
        score_sequence("".join(rng.choice("ACGT") for _ in range(200)), ALICE_KEY, "alice")
        for _ in range(200)
    ]

    mean_watermarked = sum(watermarked) / len(watermarked)
    mean_uniform = sum(uniform) / len(uniform)
    wins = sum(marked > random_score for marked, random_score in zip(watermarked, uniform))

    print(
        f"\ntournament score: watermarked mean {mean_watermarked:.4f}, "
        f"uniform mean {mean_uniform:.4f}, watermarked wins {wins}/200"
    )
    assert mean_watermarked > mean_uniform + 0.1
    assert wins >= 195


def test_score_sequence_is_key_specific() -> None:
    rng = random.Random(0xA11CE)
    seq = _tournament_sequence(rng, ALICE_KEY, "alice")

    correct = score_sequence(seq, ALICE_KEY, "alice")
    wrong_key = score_sequence(seq, BOB_KEY, "alice")
    wrong_recipient = score_sequence(seq, ALICE_KEY, "bob")

    assert correct > wrong_key + 0.1
    assert correct > wrong_recipient + 0.1


def test_score_sequence_bounds_and_short_input() -> None:
    rng = random.Random(1)
    seq = "".join(rng.choice("ACGT") for _ in range(200))
    score = score_sequence(seq, ALICE_KEY, "alice")

    assert 0.0 <= score <= 1.0
    assert score_sequence("", ALICE_KEY, "alice") == 0.0
    assert score_sequence("ACGT", ALICE_KEY, "alice") == 0.0

    with pytest.raises(ValueError):
        score_sequence("ACGN", ALICE_KEY, "alice")
