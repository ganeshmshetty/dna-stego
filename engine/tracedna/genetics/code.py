"""The standard genetic code and codon helpers."""

from __future__ import annotations

BASES = "TCAG"

_TABLE = (
    "FFLLSSSSYY**CC*W"
    "LLLLPPPPHHQQRRRR"
    "IIIMTTTTNNKKSSRR"
    "VVVVAAAADDEEGGGG"
)

# Index is built as base1*16 + base2*4 + base3 with base order TCAG.
_BASE_INDEX = {base: i for i, base in enumerate(BASES)}

CODON_TO_AA: dict[str, str] = {}
AA_TO_CODONS: dict[str, list[str]] = {}

for _i, _aa in enumerate(_TABLE):
    _codon = BASES[_i // 16] + BASES[(_i // 4) % 4] + BASES[_i % 4]
    CODON_TO_AA[_codon] = _aa
    AA_TO_CODONS.setdefault(_aa, []).append(_codon)

for _aa in AA_TO_CODONS:
    AA_TO_CODONS[_aa].sort()

STOP = "*"
SENSE_AMINO_ACIDS = sorted(aa for aa in AA_TO_CODONS if aa != STOP)


def translate(sequence: str, stop_at_stop: bool = True) -> str:
    """Translate a nucleotide sequence into one-letter amino acids."""
    seq = sequence.upper()
    if len(seq) % 3 != 0:
        raise ValueError("sequence length must be a multiple of 3")
    protein: list[str] = []
    for i in range(0, len(seq), 3):
        codon = seq[i : i + 3]
        try:
            aa = CODON_TO_AA[codon]
        except KeyError as exc:
            raise ValueError(f"invalid codon {codon!r}") from exc
        if aa == STOP and stop_at_stop:
            protein.append(STOP)
            break
        protein.append(aa)
    return "".join(protein)


def split_codons(sequence: str) -> list[str]:
    seq = sequence.upper()
    if len(seq) % 3 != 0:
        raise ValueError("sequence length must be a multiple of 3")
    return [seq[i : i + 3] for i in range(0, len(seq), 3)]


def synonyms(codon: str) -> list[str]:
    return AA_TO_CODONS[CODON_TO_AA[codon]]
