"""Codec package. Owner: agent A.

Public API::

    encode(data: bytes, key: bytes | None, key_id: str,
           params: CodecParams = CodecParams()) -> EncodeResult
    decode(strands: list[Strand], params: CodecParams = CodecParams(),
           reference: bytes | None = None) -> DecodeResult

>> from tracedna.codec import encode, decode
"""

from .decode import decode
from .encode import encode

__all__ = ["decode", "encode"]
