"""Real E. coli coding sequences as steganographic covers."""

from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from .code import AA_TO_CODONS, CODON_TO_AA, STOP, translate

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw"
CDS_FASTA = RAW / "NC_000913.3.cds.fasta"
CDS_META = RAW / "NC_000913.3.cds.json"

MIN_NT = 600
MAX_NT = 4000
MAX_GENES = 240

_GENE_RE = re.compile(r"\[gene=([^\]]+)\]")


class CorpusMissing(RuntimeError):
    pass


@dataclass(frozen=True)
class Gene:
    name: str
    nucleotide: str
    protein: str

    @property
    def codons(self) -> int:
        return len(self.nucleotide) // 3


def _parse(path: Path) -> list[Gene]:
    genes: list[Gene] = []
    name = ""
    chunks: list[str] = []
    for line in path.read_text().splitlines():
        if line.startswith(">"):
            if chunks:
                _append(genes, name, "".join(chunks))
            match = _GENE_RE.search(line)
            name = match.group(1) if match else "unnamed"
            chunks = []
        else:
            chunks.append(line.strip().upper())
    if chunks:
        _append(genes, name, "".join(chunks))
    return genes


def _append(genes: list[Gene], name: str, sequence: str) -> None:
    sequence = "".join(base for base in sequence if base in "ACGT")
    if len(sequence) < MIN_NT or len(sequence) > MAX_NT:
        return
    if len(sequence) % 3 != 0:
        return
    protein = translate(sequence)
    if not protein.endswith(STOP) or STOP in protein[:-1]:
        return
    genes.append(Gene(name=name, nucleotide=sequence, protein=protein[:-1]))


def load_corpus() -> list[Gene]:
    if not CDS_FASTA.exists():
        raise CorpusMissing(
            f"{CDS_FASTA} not found. Run: cd engine && uv run python ../scripts/fetch_cds.py"
        )
    genes = _parse(CDS_FASTA)
    if not genes:
        raise CorpusMissing("no usable coding sequences found")
    # Longest genes first: they carry the most payload, then cap for speed.
    genes.sort(key=lambda g: len(g.nucleotide), reverse=True)
    return genes[:MAX_GENES]


def build_cover(genes: list[Gene], gene_count: int) -> Gene:
    """Concatenate several real genes into one in-frame cover cassette."""
    if gene_count < 1:
        raise ValueError("gene_count must be at least 1")
    chosen = genes[:gene_count]
    nucleotide = "".join(gene.nucleotide[:-3] for gene in chosen) + "TAA"
    protein = "".join(gene.protein for gene in chosen)
    if len(nucleotide) // 3 - 1 != len(protein):
        raise ValueError("cassette assembly produced an unexpected frame")
    return Gene(
        name="+".join(gene.name for gene in chosen),
        nucleotide=nucleotide,
        protein=protein,
    )


def codon_usage(genes: list[Gene]) -> dict[str, dict[str, float]]:
    """P(codon | amino acid) measured over the corpus."""
    counts: dict[str, Counter[str]] = {}
    for gene in genes:
        for i in range(0, len(gene.nucleotide), 3):
            codon = gene.nucleotide[i : i + 3]
            counts.setdefault(CODON_TO_AA[codon], Counter())[codon] += 1

    usage: dict[str, dict[str, float]] = {}
    for aa, counter in counts.items():
        total = sum(counter.values())
        usage[aa] = {codon: count / total for codon, count in counter.items()}
    # Any amino acid absent from the corpus falls back to uniform.
    for aa, codons in AA_TO_CODONS.items():
        if aa not in usage:
            usage[aa] = {codon: 1 / len(codons) for codon in codons}
    return usage


def codon_pair_counts(genes: list[Gene]) -> dict[tuple[str, str], int]:
    counts: Counter[tuple[str, str]] = Counter()
    for gene in genes:
        codons = [gene.nucleotide[i : i + 3] for i in range(0, len(gene.nucleotide), 3)]
        for left, right in zip(codons, codons[1:]):
            counts[(left, right)] += 1
    return dict(counts)


def metadata() -> dict:
    return json.loads(CDS_META.read_text()) if CDS_META.exists() else {}
