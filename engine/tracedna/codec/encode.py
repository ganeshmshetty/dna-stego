"""Encode arbitrary bytes as a set of fixed-length DNA strands.

Spec: ``docs/superpowers/specs/2026-11-22-tracedna-design.md`` section 7.1.

Two layers of coding:

1. **Inner**, per strand::

       [index:2][valid_len:1][crc8:1][mark:N][payload:...] -> RS(50, 34) -> 200 nt

   ``N`` is 4 bytes in ``reserved`` mode and 0 in ``none`` mode, so a strand
   carries 26 or 30 payload bytes respectively.

2. **Outer**, across strands: each stripe of ``outer_k`` data blocks also emits
   ``outer_r`` parity blocks, so any ``outer_k`` of the ``outer_k + outer_r``
   strands reconstruct the stripe. Dropped strands are then recoverable instead
   of fatal.
"""

from __future__ import annotations

import math
import statistics

from ..config import MAX_STRANDS, RS_K, RS_N
from ..types import CodecParams, EncodeResult, Strand
from ..watermark.fields import reserved_field
from .outer import outer_encode
from .primitives import pack_data_block, strand_from_block


def _gc_fraction(seq: str) -> float:
    """Fraction of bases that are G or C."""
    return sum(1 for base in seq if base in "GC") / len(seq)


def _max_homopolymer(seq: str) -> int:
    """Length of the longest run of one repeated base in ``seq``."""
    if not seq:
        return 0
    longest = 1
    run = 1
    for previous, current in zip(seq, seq[1:]):
        if current == previous:
            run += 1
            longest = max(longest, run)
        else:
            run = 1
    return longest


def encode(
    data: bytes,
    key: bytes | None,
    key_id: str,
    params: CodecParams = CodecParams(),
) -> EncodeResult:
    """Encode ``data`` into strands with inner and outer error correction.

    Args:
        data: File bytes to store. Must be non-empty.
        key: Key used for the reserved watermark field. Required in
            ``"reserved"`` mode; ignored (and may be ``None``) in ``"none"``
            mode.
        key_id: Human-readable identifier for the key (the recipient name).
        params: Codec geometry, watermark mode and outer stripe geometry.

    Returns:
        An :class:`~tracedna.types.EncodeResult` carrying the strands plus the
        measured density and constraint statistics. ``nt_total`` includes the
        parity strands, so ``bits_per_nt`` already pays for durability.

    Raises:
        ValueError: If ``data`` is empty, the parameters are invalid or use an
            unsupported Reed-Solomon geometry, the mode is ``"reserved"``
            without a key, or the payload would need more than
            :data:`~tracedna.config.MAX_STRANDS` strands.
    """
    params.validate()
    if params.watermark_mode not in ("none", "reserved"):
        raise ValueError(f"unknown watermark mode: {params.watermark_mode!r}")
    if params.rs_n != RS_N or params.rs_k != RS_K:
        raise ValueError(
            f"the frozen primitives implement RS({RS_N}, {RS_K}) only, "
            f"got RS({params.rs_n}, {params.rs_k})"
        )
    if not data:
        raise ValueError("cannot encode empty data")
    if params.watermark_mode == "reserved" and key is None:
        raise ValueError("watermark_mode='reserved' requires a key")

    payload_width = params.payload_bytes_per_strand
    k = params.outer_k
    r = params.outer_r
    per_stripe = k + r

    data_block_count = max(1, math.ceil(len(data) / payload_width))
    stripe_count = math.ceil(data_block_count / k)
    total_strands = stripe_count * per_stripe
    if total_strands > MAX_STRANDS:
        raise ValueError(
            f"payload needs {total_strands} strands "
            f"({data_block_count} data + {stripe_count * r} parity), "
            f"exceeding MAX_STRANDS={MAX_STRANDS}"
        )

    strands: list[Strand] = []

    def _mark(index: int) -> bytes:
        if params.watermark_mode != "reserved":
            return b""
        assert key is not None
        return reserved_field(key, index, params.mark_bytes)

    for stripe in range(stripe_count):
        payloads: list[bytes] = []
        valid_lens: list[int] = []
        for local in range(k):
            block_number = stripe * k + local
            chunk = data[block_number * payload_width : (block_number + 1) * payload_width]
            payloads.append(chunk.ljust(payload_width, b"\x00"))
            valid_lens.append(len(chunk))

        parity = outer_encode(payloads, r)

        for local in range(k):
            index = stripe * per_stripe + local
            block = pack_data_block(index, payloads[local], valid_lens[local], _mark(index))
            strands.append(Strand(index=index, seq=strand_from_block(block)))

        for layer in range(r):
            index = stripe * per_stripe + k + layer
            block = pack_data_block(index, parity[layer], payload_width, _mark(index))
            strands.append(Strand(index=index, seq=strand_from_block(block)))

    nt_total = sum(len(strand.seq) for strand in strands)
    gc_fractions = [_gc_fraction(strand.seq) for strand in strands]

    return EncodeResult(
        strands=strands,
        key_id=key_id,
        params=params,
        payload_bytes=len(data),
        nt_total=nt_total,
        bits_per_nt=len(data) * 8 / nt_total,
        gc_mean=statistics.fmean(gc_fractions),
        gc_spread=statistics.pstdev(gc_fractions),
        max_homopolymer=max(_max_homopolymer(strand.seq) for strand in strands),
    )


__all__ = ["encode"]
