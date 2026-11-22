"""Shared data types. This module is the contract between the engine modules.

Ownership: do not change a field name or a function signature here without
updating every consumer and the design spec.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from .config import (
    HEADER_BYTES,
    MARK_BYTES,
    PAYLOAD_BYTES_NONE,
    PAYLOAD_BYTES_RESERVED,
    RS_K,
    RS_N,
    STRAND_LENGTH,
)

WatermarkMode = Literal["none", "reserved"]


@dataclass(frozen=True)
class CodecParams:
    """Codec geometry. Defaults come from config and must stay consistent."""

    strand_length: int = STRAND_LENGTH
    rs_n: int = RS_N
    rs_k: int = RS_K
    watermark_mode: WatermarkMode = "reserved"

    @property
    def payload_bytes_per_strand(self) -> int:
        if self.watermark_mode == "reserved":
            return PAYLOAD_BYTES_RESERVED
        return PAYLOAD_BYTES_NONE

    @property
    def mark_bytes(self) -> int:
        return MARK_BYTES if self.watermark_mode == "reserved" else 0

    def validate(self) -> None:
        if self.strand_length % 4 != 0:
            raise ValueError("strand_length must be a multiple of 4")
        if self.strand_length != self.rs_n * 4:
            raise ValueError("strand_length must equal rs_n * 4")
        if self.rs_k + (self.rs_n - self.rs_k) != self.rs_n:
            raise ValueError("invalid Reed-Solomon geometry")
        if HEADER_BYTES + self.mark_bytes >= self.rs_k:
            raise ValueError("header + mark consume the whole data block")


@dataclass
class Strand:
    index: int
    seq: str

    def __post_init__(self) -> None:
        self.seq = self.seq.upper()
        if any(b not in "ACGT" for b in self.seq):
            raise ValueError(f"strand {self.index} contains a non-ACGT base")


@dataclass(frozen=True)
class ChannelParams:
    sub: float = 0.0
    ins: float = 0.0
    delete: float = 0.0
    dropout: float = 0.0
    seed: int = 1

    def validate(self) -> None:
        for name in ("sub", "ins", "delete", "dropout"):
            value = getattr(self, name)
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be in [0, 1], got {value}")


@dataclass
class EncodeResult:
    strands: list[Strand]
    key_id: str
    params: CodecParams
    payload_bytes: int
    nt_total: int
    bits_per_nt: float
    gc_mean: float
    gc_spread: float
    max_homopolymer: int


@dataclass
class ChannelResult:
    strands: list[Strand]
    strands_in: int
    strands_out: int
    nt_in: int
    nt_out: int
    events: dict[str, int] = field(default_factory=dict)


@dataclass
class DecodeResult:
    ok: bool
    data: bytes | None
    sha256: str | None
    bytes_recovered: int
    strands_used: int
    strands_failed: int
    ber_pre_ecc: float | None = None
    ber_post_ecc: float | None = None


@dataclass
class VerifyResult:
    detected: bool
    recipient: str | None
    p_value: float
    score: float
    null_mean: float
    windows_searched: int
    strands_scored: int
