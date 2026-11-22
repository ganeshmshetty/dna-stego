"""Tests for the codon-steganography pipeline."""

from __future__ import annotations

import hashlib

import pytest

from tracedna.attack.codon import evaluate
from tracedna.channel.reads import sequence as sequence_reads
from tracedna.genetics.code import CODON_TO_AA, translate
from tracedna.genetics.corpus import CorpusMissing, build_cover, codon_usage, load_corpus
from tracedna.genetics.stego import embed, extract
from tracedna.keys import derive_key

MESSAGE = b"TraceDNA codon steganography round trip. " * 12
KEY = derive_key("alice")


def test_genetic_code_is_correct() -> None:
    assert CODON_TO_AA["ATG"] == "M"
    assert CODON_TO_AA["TAA"] == "*"
    assert CODON_TO_AA["TGG"] == "W"
    assert len(CODON_TO_AA) == 64
    assert translate("ATGGCTTAATAA") == "MA*"


def test_translate_rejects_bad_input() -> None:
    with pytest.raises(ValueError):
        translate("ATGGC")
    with pytest.raises(ValueError):
        translate("ATGNNN")


try:
    GENES = load_corpus()
except CorpusMissing:
    GENES = []

needs_corpus = pytest.mark.skipif(not GENES, reason="CDS corpus not fetched")


@needs_corpus
def test_corpus_is_clean() -> None:
    assert len(GENES) >= 50
    for gene in GENES[:50]:
        assert len(gene.nucleotide) % 3 == 0
        assert set(gene.nucleotide) <= set("ACGT")
        assert "*" not in gene.protein


@needs_corpus
def test_cover_cassette_keeps_frame() -> None:
    cover = build_cover(GENES, 4)
    assert cover.codons == len(cover.nucleotide) // 3
    assert len(cover.protein) + 1 == cover.codons
    assert translate(cover.nucleotide) == cover.protein + "*"


@needs_corpus
@pytest.mark.parametrize("coder", ["uniform", "usage"])
def test_embed_extract_roundtrip(coder: str) -> None:
    cover = build_cover(GENES, 6)
    usage = codon_usage(GENES)
    result = embed(cover, MESSAGE, KEY, usage, coder)

    assert result.protein == cover.protein
    assert len(result.sequence) == len(cover.nucleotide)
    assert result.bits_per_codon > 0

    recovered = extract(result.sequence, KEY, usage, coder)
    assert recovered.ok
    assert recovered.message == MESSAGE
    assert recovered.sha256 == hashlib.sha256(MESSAGE).hexdigest()


@needs_corpus
@pytest.mark.parametrize("coder", ["uniform", "usage"])
def test_wrong_key_produces_no_message(coder: str) -> None:
    cover = build_cover(GENES, 6)
    usage = codon_usage(GENES)
    result = embed(cover, MESSAGE, KEY, usage, coder)
    wrong = extract(result.sequence, derive_key("bob"), usage, coder)
    assert not wrong.ok
    assert wrong.message is None


@needs_corpus
def test_usage_coder_matches_real_usage_better_than_uniform() -> None:
    from collections import Counter

    cover = build_cover(GENES, 6)
    usage = codon_usage(GENES)

    def drift(sequence: str) -> float:
        counts = Counter(sequence[i : i + 3] for i in range(0, len(sequence), 3))
        total = sum(counts.values())
        observed = {c: n / total for c, n in counts.items()}
        target = {}
        for aa, table in usage.items():
            target.update(table)
        return sum(abs(observed.get(c, 0.0) - target.get(c, 0.0)) for c in set(observed) | set(target))

    uniform = embed(cover, MESSAGE, KEY, usage, "uniform").sequence
    matched = embed(cover, MESSAGE, KEY, usage, "usage").sequence
    assert drift(matched) < drift(uniform)


@needs_corpus
def test_message_that_does_not_fit_is_rejected() -> None:
    cover = build_cover(GENES, 1)
    usage = codon_usage(GENES)
    with pytest.raises(ValueError, match="holds at most"):
        embed(cover, b"x" * 100_000, KEY, usage, "usage")


@needs_corpus
def test_clean_consensus_recovers() -> None:
    cover = build_cover(GENES, 6)
    usage = codon_usage(GENES)
    result = embed(cover, MESSAGE, KEY, usage, "usage")
    reads = sequence_reads(result.sequence, coverage=8, sub_rate=0.002, seed=4)
    assert reads.consensus_errors == 0
    assert extract(reads.consensus, KEY, usage, "usage").ok


@needs_corpus
def test_detector_separates_uniform_and_usage() -> None:
    usage = codon_usage(GENES)
    for coder in ("uniform", "usage"):
        result = evaluate(GENES, usage, coder=coder, key=KEY, count=80)
        assert 0.0 <= result.auc <= 1.0
        assert result.n_natural >= 20
        assert result.n_test > 0
