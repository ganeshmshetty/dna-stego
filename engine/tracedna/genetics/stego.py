"""Codon-level steganography: embed a message by choosing synonymous codons."""

from __future__ import annotations

import hashlib
import hmac
import math
import random
import struct
import zlib
from dataclasses import dataclass, field
from typing import Literal

from reedsolo import RSCodec, ReedSolomonError

from .code import CODON_TO_AA, STOP, split_codons, translate
from .corpus import Gene

Coder = Literal["uniform", "usage"]
NSYM = 24
MAGIC = b"TD"
HEADER_BYTES = 2 + 4 + 4  # magic, length, crc32
# The usage-matched coder emits a variable number of bits, so the budget is a
# conservative fraction of the expected total. With thousands of codons the
# shortfall is far smaller than this margin.
USAGE_BUDGET = 0.85


@dataclass
class EmbedResult:
    sequence: str
    protein: str
    coder: Coder
    message_bytes: int
    capacity_bits: int
    payload_bits: int
    bits_per_codon: float
    codon_count: int
    capacity_bytes: int


@dataclass
class ExtractResult:
    ok: bool
    message: bytes | None
    length: int | None
    crc_ok: bool
    sha256: str | None
    bit_errors: int
    bits_read: int
    error: str | None = None
    notes: dict = field(default_factory=dict)
    checks: dict[str, bool] = field(default_factory=dict)


def _stage_checks(**overrides: bool) -> dict[str, bool]:
    """Every stage a sequence must clear, false unless reached."""
    base = {
        "translatable": False,
        "stop_ok": False,
        "ecc": False,
        "marker": False,
        "crc": False,
    }
    base.update(overrides)
    return base


# --- keyed helpers ---------------------------------------------------------
def _key_rng(key: bytes) -> random.Random:
    return random.Random(int.from_bytes(hashlib.sha256(key).digest()[:8], "big"))


def _scramble(bits: list[int], key: bytes) -> list[int]:
    """XOR the payload with a keyed stream so a wrong key yields noise."""
    rng = _key_rng(key + b"/payload")
    return [bit ^ rng.getrandbits(1) for bit in bits]


# --- Huffman construction for the usage-matched coder ----------------------
def _huffman_codes(probabilities: dict[str, float]) -> dict[str, tuple[int, int]]:
    """Return codon -> (code, length) for one amino acid."""
    import heapq

    heap: list[tuple[float, int, object]] = []
    counter = 0
    for codon, probability in probabilities.items():
        heapq.heappush(heap, (max(probability, 1e-12), counter, codon))
        counter += 1

    if len(heap) == 1:
        return {heap[0][2]: (0, 0)}  # type: ignore[index]

    merged: dict[int, tuple[int, object]] = {}
    node = counter
    while len(heap) > 1:
        p1, _, a = heapq.heappop(heap)
        p2, _, b = heapq.heappop(heap)
        merged[node] = (0, a), (1, b)  # type: ignore[assignment]
        heapq.heappush(heap, (p1 + p2, node, node))
        node += 1

    root = heap[0][2]
    codes: dict[str, tuple[int, int]] = {}

    def walk(current: object, prefix: int, depth: int) -> None:
        if isinstance(current, str):
            codes[current] = (prefix, depth)
            return
        left, right = merged[current]  # type: ignore[index]
        walk(left[1], prefix << 1, depth + 1)
        walk(right[1], (prefix << 1) | 1, depth + 1)

    walk(root, 0, 0)
    return codes


def _build_usage_tables(usage: dict[str, dict[str, float]]):
    codes: dict[str, dict[str, tuple[int, int]]] = {}
    lookup: dict[str, tuple[bytes, int]] = {}
    expected_bits: dict[str, float] = {}
    for aa, probabilities in usage.items():
        codes[aa] = _huffman_codes(probabilities)
        expected_bits[aa] = sum(
            probabilities[c] * codes[aa][c][1] for c in probabilities
        )
        for codon, (code, length) in codes[aa].items():
            if length == 0:
                lookup[codon] = (b"", 0)
            else:
                lookup[codon] = (
                    code.to_bytes(max(1, (length + 7) // 8), "big"),
                    length,
                )
    return codes, lookup, expected_bits


def _bit_writer() -> tuple[list[int], callable]:
    bits: list[int] = []

    def write(value: int, length: int) -> None:
        for shift in range(length - 1, -1, -1):
            bits.append((value >> shift) & 1)

    return bits, write


def _bits_from_bytes(data: bytes) -> list[int]:
    out: list[int] = []
    for byte in data:
        for shift in range(7, -1, -1):
            out.append((byte >> shift) & 1)
    return out


def _bytes_from_bits(bits: list[int]) -> bytes:
    out = bytearray()
    for i in range(0, len(bits) - 7, 8):
        value = 0
        for bit in bits[i : i + 8]:
            value = (value << 1) | bit
        out.append(value)
    return bytes(out)


# --- capacity --------------------------------------------------------------
def capacity_bytes_for(protein: str, coder: Coder, usage: dict[str, dict[str, float]]) -> int:
    if coder == "uniform":
        bits = sum(int(math.log2(len(codes_for(aa)))) for aa in protein)
    else:
        _, _, expected = _build_usage_tables(usage)
        bits = sum(expected[aa] for aa in protein)
    return max(0, int(bits // 8))


def _capacity_bits_for(protein: str, coder: Coder, usage: dict[str, dict[str, float]]) -> int:
    if coder == "uniform":
        return sum(int(math.log2(len(codes_for(aa)))) for aa in protein)
    _, _, expected = _build_usage_tables(usage)
    return int(sum(expected[aa] for aa in protein) * USAGE_BUDGET)


def codes_for(aa: str) -> list[str]:
    from .code import AA_TO_CODONS

    return AA_TO_CODONS[aa]


# --- embed -----------------------------------------------------------------
def embed(
    gene: Gene,
    message: bytes,
    key: bytes,
    usage: dict[str, dict[str, float]],
    coder: Coder = "uniform",
) -> EmbedResult:
    protein = gene.protein
    capacity_bits = _capacity_bits_for(protein, coder, usage)
    capacity_bytes = capacity_bits // 8
    if capacity_bytes <= HEADER_BYTES + NSYM:
        raise ValueError("cover is too short to carry even the smallest message")

    data_bytes = capacity_bytes - NSYM
    if len(message) > data_bytes - HEADER_BYTES:
        raise ValueError(
            f"message is {len(message)} bytes; this cover holds at most "
            f"{data_bytes - HEADER_BYTES} bytes with the {coder} coder"
        )

    header = MAGIC + struct.pack(">I", len(message)) + struct.pack(">I", zlib.crc32(message))
    data = header + message
    data = data.ljust(data_bytes, b"\x00")
    codeword = bytes(RSCodec(NSYM).encode(data))
    payload_bits = _bits_from_bytes(codeword)
    payload_bits = _scramble(payload_bits, key)

    rng = _key_rng(key + b"/padding")
    bits = list(payload_bits)
    while len(bits) < capacity_bits:
        bits.append(rng.getrandbits(1))

    out: list[str] = []
    if coder == "uniform":
        codes_by_aa = {aa: codes_for(aa) for aa in set(protein)}
        cursor = 0
        for aa in protein:
            options = codes_by_aa[aa]
            width = int(math.log2(len(options)))
            value = 0
            for _ in range(width):
                value = (value << 1) | bits[cursor]
                cursor += 1
            out.append(options[value % len(options)])
    else:
        codes, _, _ = _build_usage_tables(usage)
        cursor = 0
        for aa in protein:
            table = codes[aa]
            # Walk the Huffman tree by consuming bits until a leaf is reached.
            matched = None
            for length in range(1, 9):
                if cursor + length > len(bits):
                    break
                prefix = 0
                for bit in bits[cursor : cursor + length]:
                    prefix = (prefix << 1) | bit
                for codon, (code, clen) in table.items():
                    if clen == length and code == prefix:
                        matched = codon
                        break
                if matched:
                    cursor += length
                    break
            if matched is None:
                # Fall back to the most probable codon if the budget ran out.
                matched = max(table, key=lambda c: usage[aa].get(c, 0.0))
            out.append(matched)

    sequence = "".join(out) + "TAA"
    return EmbedResult(
        sequence=sequence,
        protein=translate(sequence).rstrip(STOP),
        coder=coder,
        message_bytes=len(message),
        capacity_bits=capacity_bits,
        payload_bits=len(payload_bits),
        bits_per_codon=capacity_bits / max(1, len(protein)),
        codon_count=len(protein),
        capacity_bytes=capacity_bytes,
    )


# --- extract ---------------------------------------------------------------
def extract(
    sequence: str,
    key: bytes,
    usage: dict[str, dict[str, float]],
    coder: Coder = "uniform",
) -> ExtractResult:
    try:
        protein = translate(sequence)
        codons = split_codons(sequence)
    except ValueError as exc:
        return ExtractResult(
            ok=False, message=None, length=None, crc_ok=False, sha256=None,
            bit_errors=0, bits_read=0, error=str(exc), checks=_stage_checks(),
        )

    checks = _stage_checks(translatable=True)

    expected_protein_length = len(codons) - (1 if protein.endswith(STOP) else 0)
    if len(protein.rstrip(STOP)) != expected_protein_length:
        return ExtractResult(
            ok=False, message=None, length=None, crc_ok=False, sha256=None,
            bit_errors=0, bits_read=0,
            error="internal stop codon — wrong reading frame, or not our sequence",
            checks=checks,
        )
    checks["stop_ok"] = True
    protein = protein.rstrip(STOP)

    bits: list[int] = []

    if coder == "uniform":
        for aa, codon in zip(protein, codons):
            options = codes_for(aa)
            width = int(math.log2(len(options)))
            if width == 0:
                continue
            if codon not in options:
                return ExtractResult(
                    ok=False, message=None, length=None, crc_ok=False, sha256=None,
                    bit_errors=0, bits_read=len(bits),
                    error=f"codon {codon} does not encode {aa}",
                    checks=checks,
                )
            value = options.index(codon)
            for shift in range(width - 1, -1, -1):
                bits.append((value >> shift) & 1)
    else:
        codes, _, _ = _build_usage_tables(usage)
        for aa, codon in zip(protein, codons):
            entry = codes[aa].get(codon)
            if entry is None:
                return ExtractResult(
                    ok=False, message=None, length=None, crc_ok=False, sha256=None,
                    bit_errors=0, bits_read=len(bits),
                    error=f"codon {codon} does not encode {aa}",
                    checks=checks,
                )
            code, length = entry
            for shift in range(length - 1, -1, -1):
                bits.append((code >> shift) & 1)

    capacity_bits = _capacity_bits_for(protein, coder, usage)
    if len(bits) < capacity_bits:
        return ExtractResult(
            ok=False, message=None, length=None, crc_ok=False, sha256=None,
            bit_errors=0, bits_read=len(bits),
            error="not enough bits recovered (truncated or over-damaged sequence)",
            checks=checks,
        )
    bits = bits[:capacity_bits]
    scrambled = _scramble(bits, key)
    codeword = _bytes_from_bits(scrambled)

    try:
        decoded, _full, _errata = RSCodec(NSYM).decode(codeword)
    except (ReedSolomonError, ValueError) as exc:
        return ExtractResult(
            ok=False, message=None, length=None, crc_ok=False, sha256=None,
            bit_errors=0, bits_read=len(bits),
            error=f"error correction failed: {exc}", checks=checks,
        )
    checks["ecc"] = True

    if len(decoded) < HEADER_BYTES or decoded[:2] != MAGIC:
        return ExtractResult(
            ok=False, message=None, length=None, crc_ok=False, sha256=None,
            bit_errors=0, bits_read=len(bits),
            error="no message marker — this sequence does not carry our payload",
            checks=checks,
        )
    checks["marker"] = True

    length = struct.unpack(">I", decoded[2:6])[0]
    crc = struct.unpack(">I", decoded[6:10])[0]
    body = bytes(decoded[10:])
    if length > len(body):
        return ExtractResult(
            ok=False, message=None, length=length, crc_ok=False, sha256=None,
            bit_errors=0, bits_read=len(bits),
            error="length header is invalid", checks=checks,
        )
    message = body[:length]
    crc_ok = zlib.crc32(message) == crc
    checks["crc"] = crc_ok
    return ExtractResult(
        ok=crc_ok,
        message=message if crc_ok else None,
        length=length,
        crc_ok=crc_ok,
        sha256=hashlib.sha256(message).hexdigest(),
        bit_errors=0,
        bits_read=len(bits),
        error=None if crc_ok else "CRC mismatch (wrong key, wrong coder, or damaged data)",
        checks=checks,
    )
