"""Steganalysis: can a classifier tell stego DNA from real E. coli DNA?

Features are frequency vectors, so gene length does not leak. The split is by
gene: a classifier must generalise to genes it never saw.
"""

from __future__ import annotations

import random
from collections import Counter
from dataclasses import dataclass

import numpy as np

from ..genetics.code import CODON_TO_AA, STOP, split_codons
from ..genetics.corpus import Gene, build_cover
from ..genetics.stego import Coder, embed

CODONS = sorted(c for c, aa in CODON_TO_AA.items() if aa != STOP)
CODON_INDEX = {codon: i for i, codon in enumerate(CODONS)}
BASES = "ACGT"
K = 4
KMER_INDEX = {}


def _build_kmer_index() -> None:
    for a in BASES:
        for b in BASES:
            for c in BASES:
                for d in BASES:
                    KMER_INDEX[a + b + c + d] = len(KMER_INDEX)


_build_kmer_index()
FEATURE_DIM = len(CODONS) + len(KMER_INDEX)


def features(sequence: str) -> np.ndarray:
    vector = np.zeros(FEATURE_DIM, dtype=np.float64)

    codons = split_codons(sequence)
    total = len(codons)
    if total:
        for codon in codons:
            index = CODON_INDEX.get(codon)
            if index is not None:
                vector[index] += 1.0
        vector[: len(CODONS)] /= total

    for i in range(len(sequence) - K + 1):
        index = KMER_INDEX.get(sequence[i : i + K])
        if index is not None:
            vector[len(CODONS) + index] += 1.0
    span = max(1, len(sequence) - K + 1)
    vector[len(CODONS) :] /= span
    return vector


def rank_auc(scores: np.ndarray, labels: np.ndarray) -> float:
    order = np.argsort(scores, kind="mergesort")
    ranks = np.empty(len(scores), dtype=np.float64)
    ranks[order] = np.arange(1, len(scores) + 1)
    sorted_scores = scores[order]
    start = 0
    for i in range(1, len(sorted_scores) + 1):
        if i == len(sorted_scores) or sorted_scores[i] != sorted_scores[start]:
            if i - start > 1:
                ranks[order[start:i]] = ranks[order[start:i]].mean()
            start = i
    positive = labels == 1
    n_pos = int(positive.sum())
    n_neg = len(labels) - n_pos
    if n_pos == 0 or n_neg == 0:
        return 0.5
    return float((ranks[positive].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def _logistic(x: np.ndarray, y: np.ndarray, iterations: int = 800, lr: float = 0.4):
    mean = x.mean(axis=0)
    std = x.std(axis=0)
    std[std == 0] = 1.0
    z = (x - mean) / std
    weights = np.zeros(z.shape[1])
    bias = 0.0
    n = len(y)
    for _ in range(iterations):
        logits = z @ weights + bias
        probs = 1.0 / (1.0 + np.exp(-logits))
        error = probs - y
        weights -= lr * (z.T @ error / n + 1e-3 * weights)
        bias -= lr * error.mean()
    return weights, bias, mean, std


@dataclass
class DetectionResult:
    auc: float
    tpr_at_1pct: float
    n_natural: int
    n_stego: int
    n_train: int
    n_test: int
    coder: Coder


def evaluate(
    genes: list[Gene],
    usage: dict[str, dict[str, float]],
    *,
    coder: Coder,
    key: bytes,
    count: int = 120,
    seed: int = 0,
    train_fraction: float = 0.6,
) -> DetectionResult:
    """Train on some genes, test on others, and report separability."""
    rng = random.Random(seed)
    selected = genes[:count]

    natural: list[str] = []
    stego: list[str] = []
    for gene in selected:
        capacity = max(1, len(gene.protein) // 8)
        message = bytes(rng.randrange(256) for _ in range(capacity))
        try:
            result = embed(gene, message, key, usage, coder)
        except ValueError:
            continue
        natural.append(gene.nucleotide)
        stego.append(result.sequence)

    if len(natural) < 20:
        raise ValueError("not enough usable genes for a detector")

    n = len(natural)
    cut = int(n * train_fraction)
    x_natural = np.vstack([features(s) for s in natural])
    x_stego = np.vstack([features(s) for s in stego])

    x_train = np.vstack([x_natural[:cut], x_stego[:cut]])
    y_train = np.concatenate([np.zeros(cut), np.ones(cut)])
    x_test = np.vstack([x_natural[cut:], x_stego[cut:]])
    y_test = np.concatenate([np.zeros(n - cut), np.ones(n - cut)])

    weights, bias, mean, std = _logistic(x_train, y_train)
    scores = ((x_test - mean) / std) @ weights + bias
    auc = rank_auc(scores, y_test)

    negatives = scores[y_test == 0]
    threshold = float(np.quantile(negatives, 0.99)) if len(negatives) else 1.0
    positives = scores[y_test == 1]
    tpr = float((positives > threshold).mean()) if len(positives) else 0.0

    return DetectionResult(
        auc=round(auc, 4),
        tpr_at_1pct=round(tpr, 4),
        n_natural=n,
        n_stego=n,
        n_train=cut * 2,
        n_test=(n - cut) * 2,
        coder=coder,
    )
