"""Demo key derivation.

A real deployment would generate random keys and keep them in a keystore.
Deriving them from a passphrase keeps every run reproducible offline.
"""

from __future__ import annotations

import hashlib

KEY_NAMESPACE = b"tracedna/v1/"


def derive_key(passphrase: str) -> bytes:
    return hashlib.sha256(KEY_NAMESPACE + passphrase.strip().lower().encode()).digest()
