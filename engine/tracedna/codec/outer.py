"""Cross-strand Reed-Solomon erasure coding.

Strands are grouped into stripes of ``k`` data blocks plus ``r`` parity blocks.
Any ``k`` of the ``k + r`` blocks reconstruct the stripe, so dropped or
indel-destroyed strands are recoverable instead of fatal.

The code is applied **vertically**, one byte column at a time: for byte
position ``j``, the ``k`` values across the stripe are RS-encoded into
``k + r`` values, and parity block ``t`` collects the ``t``-th parity value
from every column.
"""

from __future__ import annotations

from reedsolo import RSCodec, ReedSolomonError


def outer_encode(blocks: list[bytes], r: int) -> list[bytes]:
    """Return ``r`` parity blocks for ``blocks`` (all the same width)."""
    if r <= 0 or not blocks:
        return []
    width = len(blocks[0])
    if any(len(block) != width for block in blocks):
        raise ValueError("all data blocks in a stripe must have the same width")

    codec = RSCodec(r)
    k = len(blocks)
    parity: list[bytearray] = [bytearray() for _ in range(r)]
    for column in range(width):
        values = bytes(block[column] for block in blocks)
        encoded = codec.encode(values)
        for layer in range(r):
            parity[layer].append(encoded[k + layer])
    return [bytes(block) for block in parity]


def outer_decode(
    present: dict[int, bytes],
    k: int,
    r: int,
    width: int,
) -> list[bytes] | None:
    """Reconstruct the ``k`` data blocks of one stripe.

    ``present`` maps a local block position (0..k+r-1) to its bytes. Returns
    ``None`` when more than ``r`` positions are missing or reconstruction fails.
    """
    if k <= 0 or width <= 0:
        return None
    missing = [position for position in range(k + r) if position not in present]
    if len(missing) > r:
        return None
    if not missing:
        return [present[position] for position in range(k)]

    codec = RSCodec(r)
    data: list[bytearray] = [bytearray() for _ in range(k)]
    for column in range(width):
        values = bytearray(k + r)
        for position, block in present.items():
            if 0 <= position < k + r:
                values[position] = block[column]
        try:
            decoded, _full, _errata = codec.decode(values, erase_pos=missing)
        except (ReedSolomonError, ValueError):
            return None
        for position in range(k):
            data[position].append(decoded[position])
    return [bytes(block) for block in data]
