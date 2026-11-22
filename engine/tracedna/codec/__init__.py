"""Codec package. Owner: agent A.

Public API (implemented in this package):

    encode(data: bytes, key: bytes | None, key_id: str,
           params: CodecParams = CodecParams()) -> EncodeResult
    decode(strands: list[Strand], params: CodecParams = CodecParams(),
           reference: bytes | None = None) -> DecodeResult

>> from tracedna.codec import encode, decode
"""
