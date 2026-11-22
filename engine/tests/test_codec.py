"""Tests for the deterministic DNA storage codec.

Spec: ``docs/superpowers/specs/2026-11-22-tracedna-design.md`` sections 7.1,
9, and 12.

The codec has two coding layers: an inner RS(50,34) per strand and an outer
RS stripe across strands (``OUTER_K`` data blocks + ``OUTER_R`` parity blocks).
Whole-file recovery is therefore achievable under noise, and that is what the
realistic-preset test asserts.
"""

from __future__ import annotations

import hashlib
import math
import random

import pytest

from tracedna.channel import apply
from tracedna.codec import decode, encode
from tracedna.codec.primitives import block_from_strand, unpack_data_block
from tracedna.config import (
    CHANNEL_PRESETS,
    MARK_BYTES,
    MAX_STRANDS,
    OUTER_K,
    OUTER_R,
    PAYLOAD_BYTES_NONE,
    PAYLOAD_BYTES_RESERVED,
    STRAND_LENGTH,
)
from tracedna.types import ChannelParams, CodecParams, Strand
from tracedna.watermark.fields import derive_key, reserved_field

KEY = derive_key("alice")


def _preset(name: str, seed: int = 1) -> ChannelParams:
    """Build ChannelParams from a frozen preset (the preset key is ``del``)."""
    preset = CHANNEL_PRESETS[name]
    return ChannelParams(
        sub=preset["sub"],
        ins=preset["ins"],
        delete=preset["del"],
        dropout=preset["dropout"],
        seed=seed,
    )


CLEAN = _preset("clean")
REALISTIC = _preset("realistic")


def _payload(size: int, seed: int = 0) -> bytes:
    """Deterministic pseudo-random payload of exactly ``size`` bytes."""
    return random.Random(seed).randbytes(size)


def _gc_fraction(seq: str) -> float:
    return sum(1 for base in seq if base in "GC") / len(seq)


def _max_homopolymer(seq: str) -> int:
    longest = run = 1
    for previous, current in zip(seq, seq[1:]):
        if current == previous:
            run += 1
            longest = max(longest, run)
        else:
            run = 1
    return longest


@pytest.mark.parametrize("size", [1, 100, 1024, 8192, 65536])
def test_clean_roundtrip(size: int) -> None:
    """Every supported payload size round-trips exactly through a clean channel."""
    payload = _payload(size, seed=size)
    encoded = encode(payload, KEY, "alice")

    data_blocks = math.ceil(size / PAYLOAD_BYTES_RESERVED)
    stripes = math.ceil(data_blocks / OUTER_K)
    strand_count = stripes * (OUTER_K + OUTER_R)
    assert encoded.payload_bytes == size
    assert encoded.key_id == "alice"
    assert encoded.params.watermark_mode == "reserved"
    assert len(encoded.strands) == strand_count
    assert [strand.index for strand in encoded.strands] == list(range(strand_count))
    assert all(len(strand.seq) == STRAND_LENGTH for strand in encoded.strands)
    assert encoded.nt_total == strand_count * STRAND_LENGTH
    assert encoded.bits_per_nt == pytest.approx(size * 8 / encoded.nt_total)

    # Constraint statistics are measured, not asserted from constants.
    sequences = [strand.seq for strand in encoded.strands]
    gc_fractions = [_gc_fraction(seq) for seq in sequences]
    assert encoded.gc_mean == pytest.approx(sum(gc_fractions) / len(gc_fractions))
    expected_spread = math.sqrt(
        sum((value - encoded.gc_mean) ** 2 for value in gc_fractions)
        / len(gc_fractions)
    )
    assert encoded.gc_spread == pytest.approx(expected_spread)
    assert encoded.max_homopolymer == max(_max_homopolymer(seq) for seq in sequences)

    received = apply(encoded.strands, CLEAN)
    result = decode(received.strands, reference=payload)

    assert result.ok
    assert result.data == payload
    assert result.sha256 == hashlib.sha256(payload).hexdigest()
    assert result.bytes_recovered == size
    assert result.strands_used == strand_count
    assert result.strands_failed == 0
    assert result.ber_pre_ecc == 0.0
    assert result.ber_post_ecc == 0.0


def test_golden_first_strand_is_stable() -> None:
    """Same payload, key, and params produce identical strands every time."""
    payload = _payload(100, seed=3)
    first = encode(payload, KEY, "alice")
    second = encode(payload, KEY, "alice")

    assert first.strands[0].seq == second.strands[0].seq
    assert [strand.seq for strand in first.strands] == [
        strand.seq for strand in second.strands
    ]


def test_reserved_mode_embeds_keyed_mark_and_payload() -> None:
    """Each reserved-mode block carries its keyed mark and the right chunk."""
    payload = _payload(60, seed=5)
    encoded = encode(payload, KEY, "alice")

    per_stripe = OUTER_K + OUTER_R
    for strand in encoded.strands:
        block = block_from_strand(strand.seq)
        assert block is not None
        unpacked = unpack_data_block(block, MARK_BYTES)
        assert unpacked is not None
        index, valid_len, mark, stored = unpacked
        assert index == strand.index
        assert mark == reserved_field(KEY, index, MARK_BYTES)

        stripe, local = divmod(index, per_stripe)
        if local >= OUTER_K:
            # Parity block: every payload byte is meaningful.
            assert valid_len == PAYLOAD_BYTES_RESERVED
            continue

        block_number = stripe * OUTER_K + local
        chunk = payload[
            block_number * PAYLOAD_BYTES_RESERVED : (block_number + 1)
            * PAYLOAD_BYTES_RESERVED
        ]
        assert valid_len == len(chunk)
        assert stored == chunk.ljust(PAYLOAD_BYTES_RESERVED, b"\x00")


def test_none_mode_roundtrip_and_capacity() -> None:
    """Unmarked strands carry 30 payload bytes and decode without a key."""
    payload = _payload(100, seed=4)
    params = CodecParams(watermark_mode="none")
    encoded = encode(payload, None, "alice", params)

    assert params.payload_bytes_per_strand == PAYLOAD_BYTES_NONE == 30
    data_blocks = math.ceil(100 / 30)
    assert len(encoded.strands) == OUTER_K + OUTER_R == 16

    final_block = block_from_strand(encoded.strands[data_blocks - 1].seq)
    assert final_block is not None
    unpacked = unpack_data_block(final_block, 0)
    assert unpacked is not None
    index, valid_len, mark, stored = unpacked
    assert (index, valid_len) == (data_blocks - 1, 10)
    assert mark == b""
    assert stored == payload[90:] + b"\x00" * 20

    result = decode(encoded.strands, params, reference=payload)
    assert result.ok
    assert result.data == payload
    assert result.ber_pre_ecc == 0.0
    assert result.ber_post_ecc == 0.0


@pytest.mark.parametrize(
    ("mode", "width", "expected_bits_per_nt"),
    [
        ("reserved", PAYLOAD_BYTES_RESERVED, 0.78),
        ("none", PAYLOAD_BYTES_NONE, 0.90),
    ],
)
def test_measured_bits_per_nt(
    mode: str, width: int, expected_bits_per_nt: float
) -> None:
    """Report the measured nominal density for both watermark modes.

    One full stripe: ``OUTER_K`` data blocks plus ``OUTER_R`` parity blocks.
    The erasure layer costs ``OUTER_R / (OUTER_K + OUTER_R)`` of gross capacity.
    """
    payload = _payload(width * OUTER_K, seed=7)
    key = KEY if mode == "reserved" else None
    params = CodecParams(watermark_mode=mode)  # type: ignore[arg-type]
    encoded = encode(payload, key, "alice", params)

    assert len(encoded.strands) == OUTER_K + OUTER_R
    assert encoded.bits_per_nt == pytest.approx(expected_bits_per_nt)
    assert encoded.bits_per_nt == pytest.approx(
        width * OUTER_K * 8 / ((OUTER_K + OUTER_R) * STRAND_LENGTH)
    )
    print(f"measured bits/nt ({mode}) = {encoded.bits_per_nt:.4f}")


def test_empty_payload_is_rejected() -> None:
    with pytest.raises(ValueError, match="empty"):
        encode(b"", KEY, "alice")


def test_reserved_mode_requires_a_key() -> None:
    with pytest.raises(ValueError, match="requires a key"):
        encode(b"x", None, "alice")


def test_strand_limit_is_rejected_before_encoding() -> None:
    payload = bytes(MAX_STRANDS * PAYLOAD_BYTES_RESERVED + 1)
    with pytest.raises(ValueError, match="MAX_STRANDS"):
        encode(payload, KEY, "alice")


def test_unknown_watermark_mode_is_rejected() -> None:
    with pytest.raises(ValueError, match="watermark mode"):
        encode(b"x", KEY, "alice", CodecParams(watermark_mode="bogus"))  # type: ignore[arg-type]


def test_unsupported_rs_geometry_is_rejected() -> None:
    with pytest.raises(ValueError, match=r"RS\(50, 34\)"):
        encode(b"x", KEY, "alice", CodecParams(rs_k=40))


def test_decode_recovers_shuffled_strands() -> None:
    """Decoding groups blocks by their internal index, not list position."""
    payload = _payload(1024, seed=8)
    encoded = encode(payload, KEY, "alice")
    received = apply(encoded.strands, CLEAN).strands
    random.Random(99).shuffle(received)

    result = decode(received, reference=payload)
    assert result.ok
    assert result.data == payload


def test_missing_blocks_are_reconstructed() -> None:
    """The outer code rebuilds lost strands, and fails cleanly past capacity."""
    payload = _payload(260, seed=10)  # 10 reserved-mode blocks, one stripe
    encoded = encode(payload, KEY, "alice")

    within_budget = [strand for strand in encoded.strands if strand.index not in (4, 5, 6)]
    recovered = decode(within_budget, reference=payload)
    assert recovered.ok
    assert recovered.data == payload
    assert recovered.blocks_reconstructed == 1

    beyond_budget = [
        strand for strand in encoded.strands if strand.index not in (0, 1, 2, 3, 4)
    ]
    failed = decode(beyond_budget, reference=payload)
    assert not failed.ok
    assert failed.bytes_recovered < len(payload)


def test_duplicate_strand_is_counted_as_failure() -> None:
    payload = _payload(52, seed=11)
    encoded = encode(payload, KEY, "alice")
    received = list(encoded.strands) + [encoded.strands[0]]

    result = decode(received)
    assert result.strands_used == OUTER_K + OUTER_R
    assert result.strands_failed == 1
    assert result.data == payload


def test_decode_never_raises_on_corrupt_input() -> None:
    payload = _payload(200, seed=12)
    encoded = encode(payload, KEY, "alice")
    rng = random.Random(1)

    received = list(encoded.strands)
    received.append(Strand(index=0, seq=encoded.strands[0].seq[:-1]))
    received.append(Strand(index=1, seq=encoded.strands[1].seq + "A"))
    received.append(Strand(index=2, seq=encoded.strands[2].seq[:-1] + "A"))
    received.append(
        Strand(index=99, seq="".join(rng.choice("ACGT") for _ in range(STRAND_LENGTH)))
    )

    result = decode(received, reference=payload)
    assert result.strands_failed >= 3
    assert result.ok
    assert result.data == payload


def test_empty_input_returns_an_empty_result() -> None:
    result = decode([])
    assert not result.ok
    assert result.data is None
    assert result.sha256 is None
    assert result.bytes_recovered == 0
    assert result.strands_used == 0
    assert result.strands_failed == 0
    assert result.ber_pre_ecc is None
    assert result.ber_post_ecc is None


def test_realistic_preset_whole_file_recovery() -> None:
    """Under the realistic preset the whole file must come back, not just strands.

    This is the acceptance criterion the outer erasure layer exists for. It
    asserts a 90% whole-file recovery rate over 20 channel seeds, and every
    successful decode must be byte-exact — never a plausible-looking wrong file.
    """
    params = CodecParams()
    for size in (1024, 8192):
        payload = _payload(size, seed=100 + size)
        encoded = encode(payload, KEY, "alice")
        exact = 0
        attempts = 20

        for seed in range(attempts):
            channel_params = ChannelParams(
                sub=REALISTIC.sub,
                ins=REALISTIC.ins,
                delete=REALISTIC.delete,
                dropout=REALISTIC.dropout,
                seed=seed,
            )
            received = apply(encoded.strands, channel_params).strands
            result = decode(received, params, reference=payload)
            if result.ok:
                assert result.data == payload
                exact += 1

        rate = exact / attempts
        print(f"realistic size={size}: whole-file exact {exact}/{attempts} ({rate:.1%})")
        assert rate >= 0.90


def test_realistic_substitutions_recover_exactly() -> None:
    """With substitutions only (no erasures), realistic noise is fully corrected."""
    for size in (1024, 8192):
        payload = _payload(size, seed=200 + size)
        encoded = encode(payload, KEY, "alice")
        for seed in range(5):
            received = apply(
                encoded.strands,
                ChannelParams(sub=REALISTIC.sub, seed=seed),
            ).strands
            result = decode(received, reference=payload)
            assert result.ok
            assert result.data == payload
            assert result.ber_post_ecc == 0.0
