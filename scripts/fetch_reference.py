"""Fetch and cache the E. coli K-12 MG1655 reference genome (NC_000913.3).

Usage:
    cd engine && uv run python ../scripts/fetch_reference.py [--force]

Writes data/raw/NC_000913.3.fasta plus a .json sidecar with the sha256, length
and GC content, so every experiment can quote the exact input.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

ACCESSION = "NC_000913.3"
URL = (
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
    f"?db=nuccore&id={ACCESSION}&rettype=fasta&retmode=text"
)
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
FASTA = RAW / f"{ACCESSION}.fasta"
META = RAW / f"{ACCESSION}.json"


def parse_fasta(text: str) -> str:
    lines = text.splitlines()
    if not lines or not lines[0].startswith(">"):
        raise ValueError("response is not FASTA (first line does not start with '>')")
    sequence = "".join(line.strip() for line in lines[1:]).upper()
    cleaned = "".join(base for base in sequence if base in "ACGT")
    if len(cleaned) < 4_000_000:
        raise ValueError(f"sequence suspiciously short: {len(cleaned)} nt")
    return cleaned


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="download even if cached")
    args = parser.parse_args()

    RAW.mkdir(parents=True, exist_ok=True)

    if FASTA.exists() and not args.force:
        print(f"cached: {FASTA}")
    else:
        print(f"downloading {ACCESSION} ...")
        request = urllib.request.Request(URL, headers={"User-Agent": "tracedna/0.1"})
        with urllib.request.urlopen(request, timeout=120) as response:
            text = response.read().decode("utf-8")
        sequence = parse_fasta(text)
        width = 80
        with FASTA.open("w") as handle:
            handle.write(f">{ACCESSION} Escherichia coli K-12 MG1655, complete genome\n")
            for i in range(0, len(sequence), width):
                handle.write(sequence[i : i + width] + "\n")
        print(f"wrote {FASTA}")

    sequence = parse_fasta(FASTA.read_text())
    metadata = {
        "accession": ACCESSION,
        "organism": "Escherichia coli K-12 MG1655",
        "length_nt": len(sequence),
        "gc": round(sum(base in "GC" for base in sequence) / len(sequence), 6),
        "sha256": hashlib.sha256(sequence.encode()).hexdigest(),
        "source": URL,
    }
    META.write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
