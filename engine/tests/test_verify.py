"""Tests for the v0 reserved-mark verifier, including its calibration gate."""

from __future__ import annotations

import random

from tracedna.codec.primitives import pack_data_block, strand_from_block
from tracedna.config import (
    COMPLEMENT,
    MARK_BYTES,
    PAYLOAD_BYTES_NONE,
    PAYLOAD_BYTES_RESERVED,
    STRAND_LENGTH,
)
from tracedna.types import Strand
from tracedna.verify import verify_sequence, verify_strands
from tracedna.watermark import derive_key, reserved_field

ALICE_KEY = derive_key("alice")
BOB_KEY = derive_key("bob")
STRAND_COUNT = 41

# A fixed, non-trivial payload: every marked strand must still decode after the
# mark is placed in the data block, and the payload gives the RS decoder real
# work to do.
PAYLOAD = bytes((i * 37 + 11) & 0xFF for i in range(PAYLOAD_BYTES_RESERVED))


def _marked_strand(key: bytes, index: int) -> Strand:
    """Build one clean strand carrying ``key``'s reserved mark at ``index``."""
    mark = reserved_field(key, index, MARK_BYTES)
    block = pack_data_block(index, PAYLOAD, PAYLOAD_BYTES_RESERVED, mark)
    return Strand(index, strand_from_block(block))


def _marked_strands(key: bytes, count: int = STRAND_COUNT) -> list[Strand]:
    return [_marked_strand(key, index) for index in range(count)]


def _corrupt(seq: str, positions: list[int], rng: random.Random) -> str:
    """Substitute a different base at each requested position."""
    bases = list(seq)
    for position in positions:
        bases[position] = rng.choice([base for base in "ACGT" if base != bases[position]])
    return "".join(bases)


def _reverse_complement(seq: str) -> str:
    return seq.translate(COMPLEMENT)[::-1]


# --- true positive rate ----------------------------------------------------
def test_clean_marked_strands_are_detected_with_correct_key() -> None:
    result = verify_strands(_marked_strands(ALICE_KEY), ALICE_KEY)

    assert result.detected is True
    assert result.p_value < 1e-9
    assert result.score > 0.99
    assert result.strands_scored == STRAND_COUNT
    assert result.windows_searched == 2 * STRAND_COUNT
    assert result.null_mean == 0.5
    assert result.recipient is None


def test_single_unmarked_strand_is_not_flagged() -> None:
    """An unmarked strand does not expose a mark field under the reserved layout.

    Its data block is built with the 30-byte payload layout, so the reserved-
    layout ``valid_len`` check rejects it before any bits are compared. This is
    the spec's "single unmarked strand must not be flagged" case.
    """
    unmarked_payload = bytes(range(PAYLOAD_BYTES_NONE))
    block = pack_data_block(7, unmarked_payload, PAYLOAD_BYTES_NONE)
    strand = Strand(7, strand_from_block(block))

    result = verify_strands([strand], ALICE_KEY)

    assert result.strands_scored == 0
    assert result.p_value == 1.0
    assert result.detected is False


# --- false positives -------------------------------------------------------
def test_wrong_key_is_rejected() -> None:
    result = verify_strands(_marked_strands(ALICE_KEY), BOB_KEY)

    assert result.detected is False
    assert abs(result.score - 0.5) <= 0.1
    assert result.p_value > 0.01
    assert result.strands_scored == STRAND_COUNT


def test_random_acgt_sequence_is_not_detected() -> None:
    rng = random.Random(20261122)
    seq = "".join(rng.choice("ACGT") for _ in range(STRAND_LENGTH))

    result = verify_sequence(seq, ALICE_KEY)

    assert result.detected is False
    assert result.p_value == 1.0
    assert result.score == 0.0
    assert result.strands_scored == 0
    assert result.windows_searched == 2


# --- bad input -------------------------------------------------------------
def test_short_sequence_returns_null_result_without_raising() -> None:
    result = verify_sequence("ACGTACGTAC", ALICE_KEY)

    assert result.detected is False
    assert result.p_value == 1.0
    assert result.score == 0.0
    assert result.strands_scored == 0
    assert result.windows_searched == 0
    assert result.recipient is None


def test_empty_and_non_string_input_do_not_raise() -> None:
    for bad_input in ("", "   \n\t", None, 12345):  # type: ignore[arg-type]
        result = verify_sequence(bad_input, ALICE_KEY)  # type: ignore[arg-type]
        assert result.detected is False
        assert result.p_value == 1.0
        assert result.strands_scored == 0


def test_non_acgt_sequence_of_correct_length_is_rejected() -> None:
    # Not a reverse-complement palindrome, so both orientations are searched.
    seq = "N" + "A" * (STRAND_LENGTH - 1)

    result = verify_sequence(seq, ALICE_KEY)

    assert result.detected is False
    assert result.p_value == 1.0
    assert result.strands_scored == 0
    # Both orientations had the right geometry and were submitted to the
    # decoder, even though neither could be decoded.
    assert result.windows_searched == 2


def test_whitespace_and_lowercase_are_normalised() -> None:
    seq = _marked_strands(ALICE_KEY, count=1)[0].seq
    wrapped = "\n".join(seq.lower()[i : i + 60] for i in range(0, STRAND_LENGTH, 60))

    result = verify_sequence(wrapped, ALICE_KEY)

    assert result.detected is True
    assert result.strands_scored == 1
    assert result.score == 1.0


# --- damage ----------------------------------------------------------------
def test_twenty_percent_of_strands_with_substitutions_still_detect() -> None:
    rng = random.Random(5)
    strands = _marked_strands(ALICE_KEY)

    corrupted = 0
    for index in range(0, STRAND_COUNT, 5):  # 9 of 41 strands (22%)
        positions = rng.sample(range(STRAND_LENGTH), 4)
        strands[index] = Strand(index, _corrupt(strands[index].seq, positions, rng))
        corrupted += 1

    assert corrupted >= STRAND_COUNT * 0.2
    result = verify_strands(strands, ALICE_KEY)

    assert result.detected is True
    assert result.score > 0.99
    assert result.strands_scored == STRAND_COUNT


def test_reverse_complement_still_decodes_and_scores() -> None:
    seq = _marked_strands(ALICE_KEY, count=1)[0].seq
    reverse_complement = _reverse_complement(seq)

    result = verify_sequence(reverse_complement, ALICE_KEY)

    # The forward orientation fails to decode; the verifier's reverse-
    # complement candidate is the original strand, so the mark is recovered.
    assert result.detected is True
    assert result.score == 1.0
    assert result.strands_scored == 1
    assert result.windows_searched == 2


# --- calibration -----------------------------------------------------------
def test_calibration_on_random_acgt_sequences() -> None:
    """1000 uniform random 200 nt sequences with independent keys.

    This exercises the full verifier path, but the RS/CRC gate rejects almost
    all random DNA before the mark statistic is reached, so the measured FPR is
    dominated by framing validity rather than by binomial chance. The next test
    isolates the statistical null with valid codewords.
    """
    rng = random.Random(0xCA11B)
    flagged = 0
    decodable = 0

    for index in range(1000):
        seq = "".join(rng.choice("ACGT") for _ in range(STRAND_LENGTH))
        result = verify_sequence(seq, derive_key(f"null-acgt-{index}"))
        flagged += int(result.detected)
        decodable += int(result.strands_scored > 0)

    print(
        f"\ncalibration random ACGT: flagged {flagged}/1000 "
        f"(FPR {flagged / 1000:.4f}), decodable frames {decodable}/1000"
    )
    assert flagged <= 15, f"FPR {flagged}/1000 exceeds the 1.5% calibration gate"


def test_calibration_on_valid_codewords_with_wrong_keys() -> None:
    """1000 valid strands with random marks, scored under independent keys.

    Every strand decodes, so this is the honest null for the 32-bit mark test:
    agreement is Binomial(32, 1/2) and the empirical FPR should sit at or below
    alpha = 0.01.
    """
    rng = random.Random(0xBEEF)
    flagged = 0
    scores: list[float] = []

    for index in range(1000):
        key = derive_key(f"null-codeword-{index}")
        strand_index = rng.randrange(0x10000)
        payload = bytes(rng.randrange(256) for _ in range(PAYLOAD_BYTES_RESERVED))
        random_mark = bytes(rng.randrange(256) for _ in range(MARK_BYTES))
        block = pack_data_block(strand_index, payload, PAYLOAD_BYTES_RESERVED, random_mark)
        strand = Strand(strand_index, strand_from_block(block))

        result = verify_strands([strand], key)
        assert result.strands_scored == 1
        flagged += int(result.detected)
        scores.append(result.score)

    mean_score = sum(scores) / len(scores)
    print(
        f"\ncalibration valid codewords: flagged {flagged}/1000 "
        f"(FPR {flagged / 1000:.4f}), mean score {mean_score:.4f}"
    )
    assert flagged <= 15, f"FPR {flagged}/1000 exceeds the 1.5% calibration gate"
    assert 0.45 <= mean_score <= 0.55
