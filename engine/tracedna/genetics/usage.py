"""Codon usage statistics learned from real E. coli coding sequences."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from .code import STOP, SYNONYMS, translate

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw"
CDS_FASTA = RAW / "NC_000913.3.cds.fasta"
CACHE = RAW / "codon_usage.json"


def load_cds(path: Path | None = None, min_length: int = 300) -> list[tuple[str, str]]:
    """Return (gene label, CDS sequence) for every usable coding sequence."""
    fasta = path or CDS_FASTA
    if not fasta.exists():
        raise FileNotFoundError(
            f"{fasta} not found. Run: cd engine && uv run python ../scripts/fetch_cds.py"
        )

    records: list[tuple[str, str]] = []
    label = "unknown"
    chunks: list[str] = []
    for line in fasta.read_text().splitlines():
        if line.startswith(">"):
            if chunks:
                _add(records, label, "".join(chunks), min_length)
            label = _gene_name(line)
            chunks = []
        elif line.strip():
            chunks.append(line.strip())
    if chunks:
        _add(records, label, "".join(chunks), min_length)
    return records


def _gene_name(header: str) -> str:
    marker = "[gene="
    start = header.find(marker)
    if start == -1:
        return header[1:30]
    end = header.find("]", start)
    return header[start + len(marker) : end]


def _add(records: list[tuple[str, str]], label: str, seq: str, min_length: int) -> None:
    seq = seq.upper()
    seq = "".join(base for base in seq if base in "ACGT")
    if len(seq) < min_length or len(seq) % 3 != 0:
        return
    try:
        protein = translate(seq)
    except ValueError:
        return
    if STOP in protein[:-1] or protein[-1] != STOP:
        return
    records.append((label, seq))


def codon_counts(records: list[tuple[str, str]]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for _label, seq in records:
        for i in range(0, len(seq), 3):
            counts[seq[i : i + 3]] += 1
    return counts


def usage_table(records: list[tuple[str, str]]) -> dict[str, dict[str, float]]:
    """P(codon | amino acid), with a small floor so every synonym is usable."""
    counts = codon_counts(records)
    table: dict[str, dict[str, float]] = {}
    for amino_acid, codons in SYNONYMS.items():
        raw = {codon: counts.get(codon, 0) + 1.0 for codon in codons}
        total = sum(raw.values())
        table[amino_acid] = {codon: value / total for codon, value in raw.items()}
    return table


def expected_bits_per_codon(table: dict[str, dict[str, float]], records: list[tuple[str, str]]) -> float:
    """Average bits per codon available under the usage model."""
    import math

    counts = codon_counts(records)
    total = 0.0
    positions = 0
    for amino_acid, codons in SYNONYMS.items():
        n = sum(counts.get(codon, 0) for codon in codons)
        if n == 0 or len(codons) == 1:
            positions += n
            continue
        entropy = -sum(p * math.log2(p) for p in table[amino_acid].values() if p > 0)
        total += n * entropy
        positions += n
    return total / positions if positions else 0.0


def save_cache(table: dict[str, dict[str, float]], records: int) -> None:
    CACHE.write_text(json.dumps({"records": records, "usage": table}, indent=2) + "\n")
