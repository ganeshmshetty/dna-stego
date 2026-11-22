"""Demo key derivation.

A real deployment would generate random keys and keep them in a keystore.
Deriving them from a passphrase keeps every run reproducible offline.
"""

from __future__ import annotations

import hashlib

KEY_NAMESPACE = b"tracedna/v1/"


def derive_key(passphrase: str) -> bytes:
    return hashlib.sha256(KEY_NAMESPACE + passphrase.strip().lower().encode()).digest()


def fingerprint(key: bytes) -> str:
    """Short, human-comparable display of a key. Never the key itself."""
    digest = hashlib.sha256(key).hexdigest()[:16]
    return " ".join(digest[i : i + 4] for i in range(0, 16, 4))
