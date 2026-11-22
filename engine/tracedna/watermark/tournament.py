"""v1 watermark: keyed tournament sampling (scaffolding, not wired into the codec).

Adapted from SynthID-Text's tournament construction. The idea is that a
generative encoder samples several candidate bases at each position; a keyed
knockout tournament reweights those candidates *without changing the
distribution over random keys*, so the emitted DNA is not made more detectable
on average. Only a holder of the key can recover the bias and score it.

This module provides the three pieces the v1 encoder and detector need:

* :func:`context_seed` derives a position-independent seed from the key, the
  recipient, and the previous ``CONTEXT_LEN`` bases. No absolute position is
  used, so the mark survives insertions and deletions and can be read from any
  retained window.
* :func:`g_value` is a deterministic keyed binary scoring function.
* :func:`tournament_choice` runs the knockout tournament over a candidate list.

:func:`score_sequence` is the detector side: the mean g-value over the scored
positions. It is deliberately layer-0 only. Layer 0 decides the first
tournament round, and every knockout winner won that round or reached it on a
bye, so a watermarked base scores 1 with probability substantially above 1/2
while a uniformly random base scores 1 with probability 1/2.

Nothing here is imported by the codec yet; v0 remains the shipped mechanism.
"""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Sequence

from ..config import CONTEXT_LEN, TOURNAMENT_DEPTH

_CONTEXT_DOMAIN = b"tracedna/v1/tournament/context\x00"
_G_DOMAIN = b"tracedna/v1/tournament/g\x00"
_RANK_DOMAIN = b"tracedna/v1/tournament/rank\x00"

#: Tournament layer used by the detector. Layer 0 is the first knockout round;
#: the emitted base therefore carries a layer-0 bias (see module docstring).
_DETECTION_LAYER = 0

_BASES = frozenset("ACGT")


def _normalise_dna(text: str, *, field: str) -> str:
    """Uppercase DNA and remove whitespace, rejecting non-ACGT characters."""
    if not isinstance(text, str):
        raise TypeError(f"{field} must be a string")
    normalised = "".join(text.split()).upper()
    if any(base not in _BASES for base in normalised):
        raise ValueError(f"{field} must contain only A, C, G and T")
    return normalised


def context_seed(key: bytes, recipient: str, context: str) -> int:
    """Derive a 64-bit sampling seed from key, recipient and local context.

    ``context`` is the preceding DNA context; only its last ``CONTEXT_LEN``
    bases are used. There is no absolute-position input, so the same local
    context yields the same seed wherever it occurs in a strand: shifting the
    read, or an insertion/deletion upstream, does not change it. Short contexts
    (for example at the very start of a sequence) are accepted; the detector
    never scores those positions.

    Recipient names are stripped and lowercased, matching
    :func:`tracedna.watermark.fields.derive_key`.
    """
    if not isinstance(key, bytes):
        raise TypeError("key must be bytes")
    if not isinstance(recipient, str):
        raise TypeError("recipient must be a string")

    context_bytes = _normalise_dna(context, field="context").encode("ascii")[-CONTEXT_LEN:]
    recipient_bytes = recipient.strip().lower().encode("utf-8")

    message = (
        _CONTEXT_DOMAIN
        + len(recipient_bytes).to_bytes(2, "big")
        + recipient_bytes
        + len(context_bytes).to_bytes(1, "big")
        + context_bytes
    )
    digest = hmac.new(key, message, hashlib.sha256).digest()
    return int.from_bytes(digest[:8], "big")


def g_value(seed: int, layer: int, base: str) -> int:
    """Return the deterministic keyed score, 0 or 1, for one candidate base.

    Scores are independent-looking across seeds, layers and bases: each call is
    a distinct HMAC-SHA256 input. The seed must be a 64-bit unsigned integer
    (as returned by :func:`context_seed`); ``layer`` selects the tournament
    round; ``base`` must be a single A/C/G/T character.
    """
    if not isinstance(seed, int) or not 0 <= seed < 1 << 64:
        raise ValueError("seed must be an unsigned 64-bit integer")
    if not isinstance(layer, int) or layer < 0:
        raise ValueError("layer must be a non-negative integer")
    if not isinstance(base, str) or len(base) != 1 or base.upper() not in _BASES:
        raise ValueError("base must be one of A, C, G, T")

    message = _G_DOMAIN + layer.to_bytes(4, "big") + base.upper().encode("ascii")
    digest = hmac.new(seed.to_bytes(8, "big"), message, hashlib.sha256).digest()
    return digest[0] & 1


def _tie_rank(seed: int, layer: int, candidate: str) -> int:
    """Deterministic 64-bit rank used to break a tied match.

    The rank depends only on the seed, the layer and the candidate itself, so a
    tie resolves consistently regardless of which side of the pair is listed
    first.
    """
    message = _RANK_DOMAIN + layer.to_bytes(4, "big") + candidate.encode("ascii")
    digest = hmac.new(seed.to_bytes(8, "big"), message, hashlib.sha256).digest()
    return int.from_bytes(digest[:8], "big")


def _match(left: str, right: str, seed: int, layer: int) -> str:
    """Play one knockout match at ``layer``; return the advancing candidate."""
    if left == right:
        return left

    left_score = g_value(seed, layer, left)
    right_score = g_value(seed, layer, right)
    if left_score != right_score:
        return left if left_score > right_score else right

    # Tied scores (both 0 or both 1): break from the seed, not from list order.
    return left if _tie_rank(seed, layer, left) >= _tie_rank(seed, layer, right) else right


def tournament_choice(
    candidates: Sequence[str],
    seed: int,
    depth: int = TOURNAMENT_DEPTH,
) -> str:
    """Run a keyed knockout tournament and return the winning candidate.

    Candidates are paired in the supplied order. Round ``r`` is decided by
    ``g_value(seed, r, base)``: a score of 1 beats 0, and equal scores are
    broken by a keyed rank derived from the seed. An odd candidate receives a
    bye. After ``depth`` rounds the winner is returned; if more than one
    candidate remains (because ``depth < ceil(log2(len(candidates)))``), the
    highest keyed rank among the survivors wins. The result is always one of
    the supplied candidates.

    The candidate list order is part of the input and should be treated as
    fixed for a given distribution. Duplicate candidates are permitted.
    """
    if not isinstance(seed, int) or not 0 <= seed < 1 << 64:
        raise ValueError("seed must be an unsigned 64-bit integer")
    if not isinstance(depth, int) or depth < 1:
        raise ValueError("depth must be at least 1")

    pool: list[str] = []
    for candidate in candidates:
        if not isinstance(candidate, str) or candidate not in _BASES:
            raise ValueError("every candidate must be a single A, C, G or T base")
        pool.append(candidate)

    if not pool:
        raise ValueError("candidates must not be empty")

    layer = 0
    while len(pool) > 1 and layer < depth:
        survivors: list[str] = []
        for i in range(0, len(pool) - 1, 2):
            survivors.append(_match(pool[i], pool[i + 1], seed, layer))
        if len(pool) % 2 == 1:
            survivors.append(pool[-1])
        pool = survivors
        layer += 1

    if len(pool) == 1:
        return pool[0]

    # Depth exhausted with several survivors: deterministic keyed ranking.
    return max(pool, key=lambda candidate: _tie_rank(seed, layer, candidate))


def score_sequence(seq: str, key: bytes, recipient: str) -> float:
    """Mean layer-0 g-value over positions after the first ``CONTEXT_LEN`` bases.

    Each scored position uses :func:`context_seed` over the preceding
    ``CONTEXT_LEN`` bases and scores the observed base with
    :func:`g_value` at layer 0. A tournament-watermarked sequence scores well
    above 1/2; uniform random DNA scores about 1/2. The first ``CONTEXT_LEN``
    positions have no full context and are excluded. A sequence of at most
    ``CONTEXT_LEN`` bases scores 0.0.

    Raises ``ValueError`` if the sequence contains non-ACGT characters.
    """
    normalised = _normalise_dna(seq, field="seq")
    if len(normalised) <= CONTEXT_LEN:
        return 0.0

    total = 0
    for position in range(CONTEXT_LEN, len(normalised)):
        context = normalised[position - CONTEXT_LEN : position]
        total += g_value(context_seed(key, recipient, context), _DETECTION_LAYER, normalised[position])

    return total / (len(normalised) - CONTEXT_LEN)


__all__ = ["context_seed", "g_value", "score_sequence", "tournament_choice"]
