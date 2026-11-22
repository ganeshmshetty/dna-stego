"""Stable keyed-field contract. Signatures are frozen: the codec imports them.

A real deployment would generate random keys and keep them in a keystore. This
prototype derives keys deterministically so runs are reproducible offline.
"""

from __future__ import annotations

import hashlib
import hmac
import struct

KEY_NAMESPACE = b"tracedna/v1/"
FIELD_DOMAIN = b"reserved\x00"


def derive_key(recipient: str) -> bytes:
    """Deterministic demo key material for a recipient name."""
    return hashlib.sha256(KEY_NAMESPACE + recipient.strip().lower().encode()).digest()


def reserved_field(key: bytes, strand_index: int, n_bytes: int) -> bytes:
    """Keyed mark bytes for one strand. Same inputs -> same bytes."""
    if n_bytes < 0:
        raise ValueError("n_bytes must be non-negative")
    message = FIELD_DOMAIN + struct.pack(">I", strand_index)
    return hmac.new(key, message, hashlib.sha256).digest()[:n_bytes]
