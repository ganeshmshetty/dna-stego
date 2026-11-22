"""Frozen constants. Do not change these without updating the design spec.

Spec: docs/superpowers/specs/2026-11-22-tracedna-design.md
"""

import random as _random

BASES = "ACGT"
BASE_TO_BITS = {"A": 0b00, "C": 0b01, "G": 0b10, "T": 0b11}
BITS_TO_BASE = ("A", "C", "G", "T")

# Complement is used only by the verifier: it scores a sequence and its
# reverse complement.
COMPLEMENT = str.maketrans("ACGT", "TGCA")

# --- strand geometry -------------------------------------------------------
STRAND_LENGTH = 200          # nucleotides per synthesised strand
BITS_PER_BASE = 2
BYTES_PER_STRAND = STRAND_LENGTH // 4          # 50
RS_N = 50                    # Reed-Solomon codeword length in bytes
RS_K = 34                    # Reed-Solomon data bytes
RS_PARITY = RS_N - RS_K      # 16

# Header layout inside the 34-byte data block:
#   [strand_index:2][valid_payload_len:1][crc8:1][mark:N][payload:...]
HEADER_BYTES = 4

# The scrambler rotates each symbol by a fixed pseudo-random amount. It is
# key-independent and seed-fixed so decoding needs no side information.
SCRAMBLE_SEED = 0xA7

# --- watermark -------------------------------------------------------------
# v0: a reserved keyed field, spread across the strand by PERMUTATION.
MARK_BYTES = 4               # 32 bits
MARK_DATA_OFFSET = HEADER_BYTES
MARK_NT = MARK_BYTES * 4     # 16 nucleotides

PAYLOAD_BYTES_NONE = RS_K - HEADER_BYTES                    # 30
PAYLOAD_BYTES_RESERVED = RS_K - HEADER_BYTES - MARK_BYTES   # 26

# v1: keyed tournament sampling.
CONTEXT_LEN = 4              # hash context length (bases)
TOURNAMENT_DEPTH = 8         # tournament layers

# --- verifier --------------------------------------------------------------
WINDOW_LENGTHS = (40, 80, 120, 200)
ALPHA = 0.01                 # target false-positive rate
MIN_SEQUENCE_NT = 40

# --- channel presets (used by the UI and the evaluation sweeps) ------------
CHANNEL_PRESETS = {
    "clean":     {"sub": 0.0,   "ins": 0.0,   "del": 0.0,   "dropout": 0.0},
    "realistic": {"sub": 0.005, "ins": 0.001, "del": 0.001, "dropout": 0.10},
    "harsh":     {"sub": 0.02,  "ins": 0.01,  "del": 0.01,  "dropout": 0.30},
}

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_STRANDS = 4096
MAX_PASTE_NT = 50_000


def _build_permutation(n: int, seed: int) -> tuple[int, ...]:
    """PERMUTATION[i] is the output position of input symbol i."""
    rng = _random.Random(seed)
    order = list(range(n))
    rng.shuffle(order)
    return tuple(order)


# Fixed, key-independent. Spreads the 16 mark symbols across the whole strand
# so a truncated or re-framed read is not guaranteed to lose all of them.
PERMUTATION = _build_permutation(STRAND_LENGTH, 0x51ED)

# Output positions occupied by the mark symbols (used by the v1 detector and
# by the sequence-track UI to highlight marks).
MARK_SYMBOL_POSITIONS = tuple(
    PERMUTATION[i]
    for i in range(MARK_DATA_OFFSET * 4, (MARK_DATA_OFFSET + MARK_BYTES) * 4)
)
