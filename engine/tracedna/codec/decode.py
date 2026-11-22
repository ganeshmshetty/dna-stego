"""Decode DNA strands back into the original bytes.

Spec: ``docs/superpowers/specs/2026-11-22-tracedna-design.md`` section 7.1.

Decoding is defensive and has two layers:

1. Each strand is unscrambled, un-permuted and Reed-Solomon decoded. A strand
   that is truncated, expanded by an indel, or uncorrectable becomes a failure.
2. Each stripe is reconstructed from any ``outer_k`` of its
   ``outer_k + outer_r`` blocks. Only a stripe that loses more than
   ``outer_r`` blocks is unrecoverable.

:func:`decode` never raises on corrupt sequence data.
"""

from __future__ import annotations

import hashlib
import math

from ..config import HEADER_BYTES, RS_K, RS_N, STRAND_LENGTH
from ..types import CodecParams, DecodeResult, Strand
from .outer import outer_decode
from .primitives import (
    block_from_strand,
    nt_to_symbols,
    pack_data_block,
    rs_encode,
    symbols_to_bytes,
    unpack_data_block,
    unpermute,
    unscramble,
)


def _raw_codeword(seq: str) -> bytes | None:
    """Undo permutation and scrambling to recover the 50 received bytes.

    This is the inverse of the outermost steps of
    :func:`tracedna.codec.primitives.strand_from_block`, stopping before
    Reed-Solomon decoding so that pre-ECC errors remain visible.
    """
    try:
        symbols = nt_to_symbols(seq)
    except ValueError:
        return None
    if len(symbols) != STRAND_LENGTH:
        return None
    return symbols_to_bytes(unscramble(unpermute(symbols)))


def _pre_ecc_ber(
    strands: list[Strand],
    params: CodecParams,
    reference: bytes,
) -> float | None:
    """Bit error rate of received codewords before Reed-Solomon decoding.

    Only strands whose sequence is exactly ``STRAND_LENGTH`` nucleotides are
    counted; an insertion or deletion shifts the frame and makes the
    comparison meaningless. The expected codeword is rebuilt from the
    reference block with the *received* mark bytes, because ``decode`` has no
    key with which to regenerate the keyed field. Mark corruption is therefore
    not counted in this diagnostic; payload, header and parity errors are.

    Outer parity strands carry no direct reference chunk and are skipped.
    """
    width = params.payload_bytes_per_strand
    per_stripe = params.outer_k + params.outer_r
    total_bits = 0
    total_errors = 0

    for strand in strands:
        seq = strand.seq.strip().upper()
        if len(seq) != STRAND_LENGTH:
            continue
        index = strand.index
        if index < 0 or index > 0xFFFF:
            continue
        stripe, local = divmod(index, per_stripe)
        if local >= params.outer_k:
            continue
        block_number = stripe * params.outer_k + local
        start = block_number * width
        chunk = reference[start : start + width]
        if not chunk:
            continue

        received = _raw_codeword(seq)
        if received is None:
            continue

        payload = chunk.ljust(width, b"\x00")
        mark = received[HEADER_BYTES : HEADER_BYTES + params.mark_bytes]
        expected_block = pack_data_block(index, payload, len(chunk), mark)
        expected = rs_encode(expected_block)

        total_errors += sum(
            (received_byte ^ expected_byte).bit_count()
            for received_byte, expected_byte in zip(received, expected)
        )
        total_bits += len(expected) * 8

    if total_bits == 0:
        return None
    return total_errors / total_bits


def _post_ecc_ber(data: bytes | None, reference: bytes | None) -> float | None:
    """Bit error rate between the recovered payload and the reference."""
    if data is None or reference is None or not reference:
        return None
    if len(data) != len(reference):
        return None
    errors = sum(
        (recovered_byte ^ reference_byte).bit_count()
        for recovered_byte, reference_byte in zip(data, reference)
    )
    return errors / (len(reference) * 8)


def decode(
    strands: list[Strand],
    params: CodecParams = CodecParams(),
    reference: bytes | None = None,
) -> DecodeResult:
    """Recover the payload stored in ``strands``.

    Args:
        strands: Received strands. The list may be shuffled, truncated, or
            contain damaged sequences.
        params: Codec geometry, watermark mode and outer stripe geometry used
            for encoding.
        reference: Optional original payload. When given it pins the exact
            recovered length (padding blocks are discarded) and enables the
            pre- and post-ECC bit error rates.

    Returns:
        A :class:`~tracedna.types.DecodeResult`. ``ok`` is true when the
        recovered data blocks are contiguous from zero and, with a reference,
        the recovered length matches it. Corrupt input yields ``ok=False``
        with whatever was recoverable.

    Raises:
        ValueError: If ``params`` does not describe a supported geometry.
            Corrupt sequence data never raises.
    """
    params.validate()
    if params.watermark_mode not in ("none", "reserved"):
        raise ValueError(f"unknown watermark mode: {params.watermark_mode!r}")
    if params.rs_n != RS_N or params.rs_k != RS_K:
        raise ValueError(
            f"the frozen primitives implement RS({RS_N}, {RS_K}) only, "
            f"got RS({params.rs_n}, {params.rs_k})"
        )

    width = params.payload_bytes_per_strand
    k = params.outer_k
    r = params.outer_r
    per_stripe = k + r

    present: dict[int, tuple[int, bytes]] = {}
    strands_failed = 0

    for strand in strands:
        block = block_from_strand(strand.seq)
        if block is None:
            strands_failed += 1
            continue
        unpacked = unpack_data_block(block, params.mark_bytes)
        if unpacked is None:
            strands_failed += 1
            continue
        index, valid_len, _mark, payload = unpacked
        if index in present:
            strands_failed += 1
            continue
        present[index] = (valid_len, payload)

    recovered: dict[int, bytes] = {}
    valid_lens: dict[int, int] = {}
    reconstructed = 0
    unrecoverable_stripes = 0

    for stripe in sorted({index // per_stripe for index in present}):
        base = stripe * per_stripe
        local = {
            index - base: payload
            for index, (_valid_len, payload) in present.items()
            if base <= index < base + per_stripe
        }

        if all(local_index in local for local_index in range(k)):
            blocks = [local[local_index] for local_index in range(k)]
        else:
            blocks = outer_decode(local, k, r, width)
            if blocks is None:
                unrecoverable_stripes += 1
                continue
            reconstructed += 1

        # Key by data-block number, not strand index: parity strands leave
        # gaps in the global index space (0..k-1, k+r..2k+r-1, ...).
        for local_index, payload in enumerate(blocks):
            block_number = stripe * k + local_index
            recovered[block_number] = payload
            global_index = base + local_index
            valid_lens[block_number] = (
                present[global_index][0] if global_index in present else width
            )

    indices = sorted(recovered)
    contiguous = indices == list(range(len(indices)))
    joined = b"".join(recovered[index] for index in indices) if indices else b""

    if reference is not None:
        expected = len(reference)
        ok = bool(contiguous and len(joined) >= expected and unrecoverable_stripes == 0)
        data: bytes | None = joined[:expected] if joined else None
    else:
        parts = [
            recovered[index][: valid_lens.get(index, width)]
            for index in indices
        ]
        data = b"".join(parts) if parts else None
        ok = bool(contiguous and data)

    sha256 = hashlib.sha256(data).hexdigest() if data is not None else None

    return DecodeResult(
        ok=ok,
        data=data,
        sha256=sha256,
        bytes_recovered=len(data) if data is not None else 0,
        strands_used=len(present),
        strands_failed=strands_failed,
        blocks_reconstructed=reconstructed,
        ber_pre_ecc=(
            _pre_ecc_ber(strands, params, reference)
            if reference is not None
            else None
        ),
        ber_post_ecc=_post_ecc_ber(data, reference),
    )


__all__ = ["decode"]
