"""Watermark package.

`fields.py` is the frozen v0 contract that the codec depends on. `tournament.py`
contains the v1 keyed tournament sampler, which is importable and tested but not
yet wired into the codec.

Public API:

    derive_key(recipient: str) -> bytes
    reserved_field(key: bytes, strand_index: int, n_bytes: int) -> bytes

    context_seed(key: bytes, recipient: str, context: str) -> int
    g_value(seed: int, layer: int, base: str) -> int
    tournament_choice(candidates: Sequence[str], seed: int,
                      depth: int = TOURNAMENT_DEPTH) -> str
    score_sequence(seq: str, key: bytes, recipient: str) -> float
"""

from __future__ import annotations

from .fields import derive_key, reserved_field
from .tournament import context_seed, g_value, score_sequence, tournament_choice

__all__ = [
    "context_seed",
    "derive_key",
    "g_value",
    "reserved_field",
    "score_sequence",
    "tournament_choice",
]
