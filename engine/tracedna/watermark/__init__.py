"""Watermark package. Owner: agent B.

`fields.py` is the frozen contract that the codec depends on. Everything else
in this package may be extended by agent B.

Public API:

    derive_key(recipient: str) -> bytes
    reserved_field(key: bytes, strand_index: int, n_bytes: int) -> bytes
"""
