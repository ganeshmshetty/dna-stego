"""Tests for the reference loader and region-disjoint sampling."""

from __future__ import annotations

import pytest

from tracedna.data.reference import (
    ReferenceMissing,
    gc_of,
    load_reference,
    sample_windows,
    split_bounds,
)

try:
    REFERENCE = load_reference()
except ReferenceMissing:
    REFERENCE = None

needs_reference = pytest.mark.skipif(
    REFERENCE is None,
    reason="reference genome not fetched; run scripts/fetch_reference.py",
)


def test_split_bounds_are_contiguous_and_disjoint() -> None:
    (a_start, a_end), (b_start, b_end) = split_bounds(1000)
    assert a_start == 0
    assert a_end == b_start
    assert b_end == 1000


@needs_reference
def test_reference_identity() -> None:
    assert REFERENCE is not None
    assert REFERENCE.accession == "NC_000913.3"
    assert REFERENCE.length == 4_641_652
    assert 0.50 < REFERENCE.gc < 0.51


@needs_reference
def test_windows_do_not_overlap_within_a_split() -> None:
    windows = sample_windows(REFERENCE, count=200, seed=1, split="train")
    joined = "".join(windows)
    assert len(windows) == 200
    assert all(len(w) == 200 for w in windows)
    assert len(joined) == 200 * 200


@needs_reference
def test_train_and_test_regions_never_share_coordinates() -> None:
    train = sample_windows(REFERENCE, count=50, seed=7, split="train")
    test = sample_windows(REFERENCE, count=50, seed=7, split="test")
    train_set = set(train)
    assert not train_set & set(test)
    # Same seed, different split -> different windows by construction.
    assert train != test


@needs_reference
def test_sampling_is_deterministic() -> None:
    a = sample_windows(REFERENCE, count=20, seed=42, split="test")
    b = sample_windows(REFERENCE, count=20, seed=42, split="test")
    assert a == b


@needs_reference
def test_sampling_rejects_impossible_requests() -> None:
    with pytest.raises(ValueError):
        sample_windows(REFERENCE, count=10_000_000, split="train")
    with pytest.raises(ValueError):
        sample_windows(REFERENCE, split="nope")
    with pytest.raises(ValueError):
        sample_windows(REFERENCE, length=0)


@needs_reference
def test_gc_helper() -> None:
    assert gc_of("GGCC") == 1.0
    assert gc_of("ATAT") == 0.0
    assert gc_of("ACGT") == 0.5
