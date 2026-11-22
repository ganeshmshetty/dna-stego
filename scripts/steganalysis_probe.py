"""Probe: how detectable is our generated DNA to a k-mer classifier?

This is a measurement, not the shippable steganalysis attacker. It answers one
question with a number: can a simple 4-mer classifier separate our strands from
real E. coli windows?

Usage:
    cd engine && uv run python ../scripts/steganalysis_probe.py
"""

from __future__ import annotations

import numpy as np

from tracedna.codec.primitives import pack_data_block, strand_from_block
from tracedna.data.reference import gc_of, load_reference, sample_windows
from tracedna.watermark.fields import derive_key, reserved_field

K = 4
ALPHABET = "ACGT"
INDEX = {base: i for i, base in enumerate(ALPHABET)}
WINDOW = 200
COUNT = 1000


def kmer_frequencies(seq: str) -> np.ndarray:
    vector = np.zeros(4**K, dtype=np.float64)
    for i in range(len(seq) - K + 1):
        code = 0
        for base in seq[i : i + K]:
            code = code * 4 + INDEX[base]
        vector[code] += 1.0
    total = vector.sum()
    return vector / total if total else vector


def build_matrix(sequences: list[str]) -> np.ndarray:
    return np.vstack([kmer_frequencies(seq) for seq in sequences])


def make_generated(count: int, key: bytes, seed: int = 0) -> list[str]:
    """One strand per payload block, exactly as encode() would emit it."""
    rng = np.random.default_rng(seed)
    strands: list[str] = []
    for i in range(count):
        payload = rng.integers(0, 256, size=26, dtype=np.uint8).tobytes()
        mark = reserved_field(key, i % 65536, 4)
        block = pack_data_block(i % 65536, payload, 26, mark)
        strands.append(strand_from_block(block))
    return strands


def rank_auc(scores: np.ndarray, labels: np.ndarray) -> float:
    """Mann-Whitney AUC. labels: 1 = generated, 0 = natural."""
    order = np.argsort(scores, kind="mergesort")
    ranks = np.empty(len(scores), dtype=np.float64)
    ranks[order] = np.arange(1, len(scores) + 1)

    # Average ranks for ties so the statistic stays exact.
    sorted_scores = scores[order]
    start = 0
    for i in range(1, len(sorted_scores) + 1):
        if i == len(sorted_scores) or sorted_scores[i] != sorted_scores[start]:
            if i - start > 1:
                ranks[order[start:i]] = ranks[order[start:i]].mean()
            start = i

    positives = labels == 1
    n_pos = int(positives.sum())
    n_neg = len(labels) - n_pos
    return float((ranks[positives].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def logistic_regression(
    x_train: np.ndarray, y_train: np.ndarray, iterations: int = 1200, lr: float = 0.5
) -> tuple[np.ndarray, float]:
    mean = x_train.mean(axis=0)
    std = x_train.std(axis=0)
    std[std == 0] = 1.0
    x = (x_train - mean) / std

    weights = np.zeros(x.shape[1])
    bias = 0.0
    n = len(y_train)
    for _ in range(iterations):
        logits = x @ weights + bias
        probs = 1.0 / (1.0 + np.exp(-logits))
        error = probs - y_train
        weights -= lr * (x.T @ error / n + 1e-4 * weights)
        bias -= lr * error.mean()
    return weights, bias


def main() -> int:
    reference = load_reference()
    natural = sample_windows(reference, length=WINDOW, count=COUNT, seed=11, split="test")
    generated = make_generated(COUNT, derive_key("alice"), seed=7)

    x_natural = build_matrix(natural)
    x_generated = build_matrix(generated)

    # Deterministic 70/30 split, interleaved so both classes are represented.
    rng = np.random.default_rng(2026)
    natural_idx = rng.permutation(COUNT)
    generated_idx = rng.permutation(COUNT)
    n_train = int(COUNT * 0.7)

    train = np.vstack([x_natural[natural_idx[:n_train]], x_generated[generated_idx[:n_train]]])
    y_train = np.concatenate([np.zeros(n_train), np.ones(n_train)])
    test = np.vstack([x_natural[natural_idx[n_train:]], x_generated[generated_idx[n_train:]]])
    y_test = np.concatenate([np.zeros(COUNT - n_train), np.ones(COUNT - n_train)])

    weights, bias = logistic_regression(train, y_train)
    mean = train.mean(axis=0)
    std = train.std(axis=0)
    std[std == 0] = 1.0
    scores = ((test - mean) / std) @ weights + bias
    auc = rank_auc(scores, y_test)

    # Baseline: GC content alone.
    gc_scores = np.array([gc_of(seq) for seq in natural[n_train:] + generated[n_train:]])
    gc_auc = rank_auc(gc_scores, y_test)

    # Distribution distance.
    l1 = float(np.abs(x_natural.mean(axis=0) - x_generated.mean(axis=0)).sum())

    print(f"windows            : {COUNT} natural (held-out region) vs {COUNT} generated")
    print(f"features           : {4**K}-dim 4-mer frequencies")
    print(f"GC natural         : {np.mean([gc_of(s) for s in natural]):.4f}")
    print(f"GC generated       : {np.mean([gc_of(s) for s in generated]):.4f}")
    print(f"4-mer L1 distance  : {l1:.4f}  (1-mer-identical would be 0)")
    print(f"GC-only AUC        : {gc_auc:.4f}")
    print(f"4-mer classifier   : AUC {auc:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
