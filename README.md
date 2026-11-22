# TraceDNA

**Codon-level DNA steganography on real *E. coli* coding sequences.**

Pick a real gene, hide a message inside it by choosing synonymous codons, damage it with
simulated sequencing, recover the message byte-for-byte, and measure whether a classifier
can tell the stego DNA from real DNA.

The protein never changes. Only the letters do.

Everything is simulated. No DNA is synthesised or sequenced.

---

## The five steps

| Step | What happens |
|---|---|
| **1 · Cover** | Choose a cassette of real *E. coli* K-12 coding sequences (NC_000913.3) and a coder |
| **2 · Embed** | A message becomes bits, gets error correction, and is written into the choice of synonymous codons |
| **3 · Damage** | Simulated sequencing: N reads, per-base substitution errors, majority consensus |
| **4 · Recover** | Codons → bits → error correction → message, checked by CRC-32 and SHA-256 |
| **5 · Detect** | A classifier tries to tell stego DNA from natural DNA; report AUC and TPR @ 1% FPR |

## Why it works

The genetic code is redundant: leucine has six codons, proline four. Swapping one for
another leaves the amino acid — and therefore the protein — identical. That spare choice is
the hiding space.

**Two coders, both from the literature:**

- **Uniform** — pick a synonym uniformly. Maximum capacity, obviously detectable.
- **Usage-matched** — a Huffman code per amino acid, trained on real *E. coli* codon usage.
  Less capacity, closer statistics.

## Decoding and the key

Decoding does **not** need the original DNA:

1. Translate the stego sequence — you get the amino-acid sequence (identical to the cover).
2. Each codon's identity within its synonym set gives bits.
3. Run the bits through the same coder, then error-correct.
4. Verify with **CRC-32** (random bits pass ~1 in 4 billion) and **SHA-256** against the
   original.

The key is a **shared secret**, not a keypair. It scrambles the payload bits and seeds the
padding, so without it you extract noise and the CRC fails. The algorithm is public.

## Measured results

On an 8-gene, 30,939 nt cover:

| Coder | Capacity | Bits/codon | Protein | Recovery | Detector AUC |
|---|---|---|---|---|---|
| uniform | 1,985 B | 1.541 | identical | ✓ exact | **1.00** |
| usage | 1,686 B | 1.308 | identical | ✓ exact | **1.00** |

**The honest headline:** both coders are trivially detectable. Usage matching halves the
codon-usage drift but does not hide the message — substitution-based embedding is
theoretically distinguishable from natural DNA. The project reports this rather than
claiming undetectability.

## Run

```sh
make setup     # uv sync + npm install
make dev       # API :8000, web :5173
```

Open **<http://localhost:5173/cover>**. Vite proxies `/api` to the engine, so the browser
only talks to one origin.

```sh
make test      # 19 engine tests + production build
```

## Layout

```
engine/tracedna/
  genetics/code.py      the genetic code, translation, synonym sets
  genetics/corpus.py    real E. coli CDS, codon usage, cover cassettes
  genetics/stego.py     embed / extract, both coders, ECC, CRC
  channel/reads.py      coverage, substitutions, consensus
  attack/codon.py       steganalysis detector (logistic regression)
  api/                  FastAPI session layer
web/src/pages/          Cover · Embed · Damage · Recover · Detect
data/raw/               genome and CDS (gitignored; fetched by scripts/)
```

## Honest limits

- **Simulated only.** No synthesis, no sequencing, no wet lab.
- **Substitution-only channel.** Molecular indels would frameshift and destroy the protein;
  read-level indels need alignment and are future work.
- **Perfect undetectability is impossible** with substitution-based embedding. We measure
  the trade-off instead of claiming secrecy.
- **Prior art is dense** — BioCode (2013), DNA-LCEB (2014), DNAMark (2025). This is a
  college prototype, not a novel contribution.
- **The key is symmetric.** This is a demonstration, not cryptographic security.
