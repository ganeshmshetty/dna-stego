"""Fetch the annotated coding sequences (CDS) of E. coli K-12 MG1655.

The genome FASTA gives us the letters; the CDS FASTA gives us the genes and
their protein translations, which is what codon steganography needs.

Usage:
    cd engine && uv run python ../scripts/fetch_cds.py [--force]
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
    f"?db=nuccore&id={ACCESSION}&rettype=fasta_cds_na&retmode=text"
)
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
FASTA = RAW / f"{ACCESSION}.cds.fasta"
META = RAW / f"{ACCESSION}.cds.json"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)

    if not FASTA.exists() or args.force:
        print(f"downloading CDS for {ACCESSION} ...")
        request = urllib.request.Request(URL, headers={"User-Agent": "tracedna/1"})
        with urllib.request.urlopen(request, timeout=180) as response:
            text = response.read().decode("utf-8")
        if not text.startswith(">"):
            print("unexpected response (not FASTA):", text[:200], file=sys.stderr)
            return 1
        FASTA.write_text(text)
        print(f"wrote {FASTA}")

    records = 0
    total_nt = 0
    header_sample: list[str] = []
    for line in FASTA.read_text().splitlines():
        if line.startswith(">"):
            records += 1
            if len(header_sample) < 3:
                header_sample.append(line[:160])
        else:
            total_nt += len(line.strip())

    metadata = {
        "accession": ACCESSION,
        "records": records,
        "total_nt": total_nt,
        "mean_length": round(total_nt / records, 1) if records else 0,
        "sha256": hashlib.sha256(FASTA.read_bytes()).hexdigest(),
        "source": URL,
        "header_sample": header_sample,
    }
    META.write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
