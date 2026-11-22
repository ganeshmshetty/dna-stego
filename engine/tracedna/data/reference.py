"""Reference genome access and region-disjoint window sampling.

The split is by genomic coordinate, not by window: windows from the training
region can never overlap windows from the test region. That is the leakage
control the design spec requires.
"""

from __future__ import annotations

import hashlib
import json
import random
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw"
ACCESSION = "NC_000913.3"
FASTA = RAW / f"{ACCESSION}.fasta"
META = RAW / f"{ACCESSION}.json"

TRAIN_FRACTION = 0.8


class ReferenceMissing(RuntimeError):
    """Raised when the genome has not been fetched yet."""


@dataclass(frozen=True)
class Reference:
    accession: str
    sequence: str
    gc: float
    sha256: str

    @property
    def length(self) -> int:
        return len(self.sequence)


def load_reference(path: Path | None = None) -> Reference:
    fasta = path or FASTA
    if not fasta.exists():
        raise ReferenceMissing(
            f"{fasta} not found. Run: cd engine && uv run python ../scripts/fetch_reference.py"
        )
    lines = fasta.read_text().splitlines()
    sequence = "".join(line.strip() for line in lines[1:]).upper()
    sequence = "".join(base for base in sequence if base in "ACGT")
    if len(sequence) < 4_000_000:
        raise ValueError(f"reference looks truncated: {len(sequence)} nt")

    metadata = json.loads(META.read_text()) if META.exists() else {}
    gc = sum(base in "GC" for base in sequence) / len(sequence)
    return Reference(
        accession=metadata.get("accession", ACCESSION),
        sequence=sequence,
        gc=round(gc, 6),
        sha256=hashlib.sha256(sequence.encode()).hexdigest(),
    )


def split_bounds(length: int, train_fraction: float = TRAIN_FRACTION) -> tuple[tuple[int, int], tuple[int, int]]:
    """Two contiguous, non-overlapping coordinate ranges: (train, test)."""
    if not 0.0 < train_fraction < 1.0:
        raise ValueError("train_fraction must be in (0, 1)")
    cut = int(length * train_fraction)
    return (0, cut), (cut, length)


def sample_windows(
    reference: Reference,
    *,
    length: int = 200,
    count: int = 1000,
    seed: int = 0,
    split: str = "train",
    train_fraction: float = TRAIN_FRACTION,
) -> list[str]:
    """Sample non-overlapping windows from one side of the coordinate split.

    Non-overlap is guaranteed by construction: window i starts at
    `start + i * length`, so no two windows share a base. The coordinate split
    guarantees no train window can overlap a test window.
    """
    if split not in {"train", "test"}:
        raise ValueError("split must be 'train' or 'test'")
    if length < 1:
        raise ValueError("length must be at least 1")
    if count < 1:
        raise ValueError("count must be at least 1")
    train, test = split_bounds(reference.length, train_fraction)
    start, end = train if split == "train" else test

    capacity = (end - start) // length
    if capacity < 1:
        raise ValueError("reference region is shorter than one window")
    if count > capacity:
        raise ValueError(f"asked for {count} windows but {split} region holds {capacity} non-overlapping")

    rng = random.Random((seed << 1) ^ (0 if split == "train" else 1))
    indices = sorted(rng.sample(range(capacity), count))
    return [reference.sequence[start + i * length : start + (i + 1) * length] for i in indices]


def gc_of(sequence: str) -> float:
    return round(sum(base in "GC" for base in sequence) / len(sequence), 6)
