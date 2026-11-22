"""v0 verifier: statistical detection of the reserved keyed mark.

A marked strand carries ``MARK_BYTES`` keyed mark bytes inside its 34-byte
Reed-Solomon data block. The verifier decodes a candidate strand, recomputes
the expected mark for the strand index carried in that block, and counts
matching mark bits. The counts are pooled over all decodable strands and tested
against the null hypothesis "each bit agrees with probability 1/2" with a
one-sided binomial test.

Why it works: the mark lives *inside* a valid RS codeword protected by a CRC,
so the decoder is forced to produce a data block even for a wrong key or for
DNA that never carried our mark. In those cases the observed mark is
independent of the expected one and agreement is ~50%. With the correct key
agreement is ~100% (channel damage within the RS correction radius is repaired
before the mark is compared). A single 32-bit mark is a coarse test on its own
(24 of 32 matching bits are needed at alpha = 0.01); pooling 41 strands gives
1,312 bits and drives the p-value to numerical zero.

The verifier only sees key *bytes*. It cannot name a recipient: the API layer
maps a key id to a recipient name. Therefore ``recipient`` is always ``None``
in the returned :class:`~tracedna.types.VerifyResult`. Per-recipient
identification is the fingerprint layer's job: it runs this detector once per
known key and reports the matches (design spec section 7.4).
"""

from __future__ import annotations

import math

from scipy.stats import binom

from ..codec.primitives import block_from_strand, unpack_data_block
from ..config import ALPHA, COMPLEMENT, MARK_BYTES, STRAND_LENGTH
from ..types import Strand, VerifyResult
from ..watermark.fields import reserved_field

# The null agreement probability for one mark bit. A wrong key behaves like a
# fair coin per bit, independently across bits and strands.
_NULL_BIT_PROBABILITY = 0.5


def _normalise(seq: str) -> str:
    """Remove all whitespace/newlines and uppercase.

    Interior whitespace is removed rather than only stripped from the ends so
    that a sequence pasted as wrapped FASTA-style lines is still usable.
    """
    return "".join(seq.split()).upper()


def _orientations(seq: str) -> tuple[str, ...]:
    """Return the distinct candidate orientations of ``seq``.

    Both the sequence itself and its reverse complement are searched because a
    sequenced molecule may be reported in either orientation. A reverse-
    complement palindrome is returned once so its bits cannot be counted twice.
    """
    reverse_complement = seq.translate(COMPLEMENT)[::-1]
    if reverse_complement == seq:
        return (seq,)
    return (seq, reverse_complement)


def _matching_bits(observed: bytes, expected: bytes) -> int:
    """Number of equal bits between two equal-length byte strings."""
    if len(observed) != len(expected):
        return 0
    return sum(8 - (a ^ b).bit_count() for a, b in zip(observed, expected))


def _accumulate(seq: str, key: bytes) -> tuple[int, int, int]:
    """Decode every orientation of one strand.

    Returns ``(matching_bits, strands_scored, windows_searched)``.
    ``windows_searched`` counts the orientations that had the exact strand
    geometry and were therefore submitted to the decoder; both a CRC failure
    and an RS failure still count as a searched window, while a short or
    wrong-length sequence does not.
    """
    matches = 0
    scored = 0
    windows = 0

    for candidate in _orientations(seq):
        if len(candidate) != STRAND_LENGTH:
            continue
        windows += 1
        block = block_from_strand(candidate)
        if block is None:
            continue
        unpacked = unpack_data_block(block, MARK_BYTES)
        if unpacked is None:
            continue
        index, _valid_len, mark, _payload = unpacked
        expected = reserved_field(key, index, MARK_BYTES)
        # Why this works: the mark sits inside a valid RS codeword protected by
        # a CRC, so decoding always yields *some* mark bytes. Under a wrong key,
        # or for DNA that never carried our mark, those bytes are independent of
        # the expectation and agree on ~50% of bits. Under the correct key they
        # agree on ~100% (RS has already repaired channel damage). That gap is
        # the entire detection signal; the binomial test below quantifies it.
        matches += _matching_bits(mark, expected)
        scored += 1

    return matches, scored, windows


def _verdict(matches: int, scored: int, windows: int) -> VerifyResult:
    """Build the statistical verdict from pooled mark-bit evidence."""
    n = MARK_BYTES * 8 * scored
    if n == 0:
        return VerifyResult(
            detected=False,
            recipient=None,
            p_value=1.0,
            score=0.0,
            null_mean=_NULL_BIT_PROBABILITY,
            windows_searched=windows,
            strands_scored=0,
        )

    # P(X >= matches) for X ~ Binomial(n, 1/2). scipy's sf(k) is P(X > k), so
    # pass matches - 1. A fully matching set underflows at double precision;
    # clamp to a quotable floor so the API never reports a bare 0.0.
    p_value = float(binom.sf(matches - 1, n, _NULL_BIT_PROBABILITY))
    if math.isnan(p_value):  # pragma: no cover - scipy does not do this, guard only
        p_value = 1.0
    p_value = max(p_value, 1e-300)

    return VerifyResult(
        detected=bool(p_value < ALPHA and n > 0),
        recipient=None,
        p_value=p_value,
        score=matches / n,
        null_mean=_NULL_BIT_PROBABILITY,
        windows_searched=windows,
        strands_scored=scored,
    )


def verify_sequence(seq: str, key: bytes) -> VerifyResult:
    """Test one pasted sequence for the v0 reserved mark under ``key``.

    The sequence and its reverse complement are both attempted. A candidate is
    usable only when it is exactly ``STRAND_LENGTH`` (200) nucleotides; it must
    then survive Reed-Solomon decoding and the CRC check before its mark bits
    are compared with ``reserved_field(key, index, MARK_BYTES)``.

    Bad input never raises: a short, empty, non-string, or non-ACGT sequence
    returns ``detected=False``, ``p_value=1.0``, ``score=0.0`` and
    ``strands_scored=0``.

    ``windows_searched`` is the number of candidate orientations that had the
    correct strand geometry and were submitted to the decoder: 2 for an
    ordinary 200 nt sequence (forward and reverse complement), 1 for a
    reverse-complement palindrome, and 0 for anything shorter or longer.

    ``recipient`` is always ``None``: this function only knows the key bytes,
    not which recipient the key belongs to.
    """
    if not isinstance(seq, str):
        return _verdict(0, 0, 0)

    matches, scored, windows = _accumulate(_normalise(seq), key)
    return _verdict(matches, scored, windows)


def verify_strands(strands: list[Strand], key: bytes) -> VerifyResult:
    """Test a set of strands and pool their mark-bit evidence.

    Each strand contributes its forward orientation and, unless it is a
    reverse-complement palindrome, its reverse complement. Counts are pooled
    *before* the binomial test, so 41 clean marked strands contribute
    41 * 32 = 1,312 bits and give a p-value far below 1e-9 under the correct
    key. The returned ``strands_scored`` is the number of decodable strand
    orientations that carried a valid mark field.

    ``windows_searched`` is the total number of candidate orientations across
    all supplied strands that had the exact strand geometry. Malformed entries
    (no string ``seq`` attribute, short sequences, non-ACGT bases) are skipped
    rather than raising.

    ``recipient`` is always ``None``: per-recipient identification is done by
    running this detector for each known key in the fingerprint layer.
    """
    total_matches = 0
    total_scored = 0
    total_windows = 0

    for strand in strands:
        seq = getattr(strand, "seq", None)
        if not isinstance(seq, str):
            continue
        matches, scored, windows = _accumulate(_normalise(seq), key)
        total_matches += matches
        total_scored += scored
        total_windows += windows

    return _verdict(total_matches, total_scored, total_windows)


__all__ = ["verify_sequence", "verify_strands"]
