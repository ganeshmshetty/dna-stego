"""Verifier package.

Public API:

    verify_sequence(seq: str, key: bytes) -> VerifyResult
    verify_strands(strands: list[Strand], key: bytes) -> VerifyResult
"""

from __future__ import annotations

from .detector import verify_sequence, verify_strands

__all__ = ["verify_sequence", "verify_strands"]
