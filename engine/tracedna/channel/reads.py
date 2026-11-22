"""Sequencing simulation: coverage, substitution errors, and consensus."""

from __future__ import annotations

import random
from collections import Counter
from dataclasses import dataclass

BASES = "ACGT"


@dataclass
class ReadResult:
    consensus: str
    coverage: int
    sub_rate: float
    reads: int
    bases_read: int
    substitutions: int
    consensus_errors: int


def _mutate(sequence: str, sub_rate: float, rng: random.Random) -> tuple[str, int]:
    out: list[str] = []
    errors = 0
    for base in sequence:
        if rng.random() < sub_rate:
            out.append(rng.choice([b for b in BASES if b != base]))
            errors += 1
        else:
            out.append(base)
    return "".join(out), errors


def sequence(
    original: str,
    *,
    coverage: int = 10,
    sub_rate: float = 0.001,
    seed: int = 1,
) -> ReadResult:
    """Simulate ``coverage`` reads of ``original`` and take a majority consensus.

    Substitution-only. Molecular insertions or deletions would frameshift the
    coding sequence and destroy the protein, which is outside this project's
    claim; read-level indels need alignment and are future work.
    """
    if coverage < 1:
        raise ValueError("coverage must be at least 1")
    if not 0.0 <= sub_rate <= 0.5:
        raise ValueError("sub_rate must be in [0, 0.5]")

    rng = random.Random(seed)
    reads: list[str] = []
    substitutions = 0
    for _ in range(coverage):
        read, errors = _mutate(original, sub_rate, rng)
        reads.append(read)
        substitutions += errors

    consensus_chars: list[str] = []
    for i in range(len(original)):
        column = Counter(read[i] for read in reads)
        consensus_chars.append(column.most_common(1)[0][0])
    consensus = "".join(consensus_chars)

    return ReadResult(
        consensus=consensus,
        coverage=coverage,
        sub_rate=sub_rate,
        reads=len(reads),
        bases_read=len(original) * coverage,
        substitutions=substitutions,
        consensus_errors=sum(1 for a, b in zip(consensus, original) if a != b),
    )
