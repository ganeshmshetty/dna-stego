# Steganalysis probe: v0 is detectable

Measured 2026-11-22 against the codec that ships today. Reproduce with:

```sh
cd engine && uv run python ../scripts/steganalysis_probe.py
```

| Measurement | Value |
| --- | --- |
| Natural windows | 1,000 (held-out region of NC_000913.3) |
| Generated strands | 1,000 (reserved mode, one per payload block) |
| Features | 256-dimensional 4-mer frequencies |
| GC, natural | 0.5119 |
| GC, generated | 0.5071 |
| 4-mer L1 distance | 0.3085 |
| GC-only AUC | 0.4195 |
| **4-mer classifier AUC** | **0.9674** |

## What this means

**v0 is not steganographic.** A trivial 4-mer logistic regression separates our strands
from real *E. coli* at AUC 0.97, on held-out genomic regions. That is close to trivially
detectable: at a 1% false-positive rate it would catch the large majority of our strands.

**GC content is not the tell, and matching it is not sufficient.** Our GC (0.5071) sits
almost exactly on the reference (0.5119), and GC alone barely separates the classes
(AUC 0.42 as scored, i.e. ~0.58 when the sign is flipped). The classifier is winning on
**higher-order structure**: short-word composition. This is precisely the trap the design
deck warns about — a GC-only naturalness test would have declared success.

## Why it is detectable

The encoder is a scrambler over a Reed–Solomon codeword. That produces something close to
uniform random DNA: flat 4-mer distribution, no dinucleotide bias, no repeats, no
genomic structure. *E. coli* is not uniform — it has strong dinucleotide biases, codon
usage structure, and repetitive elements. A 4-mer model sees that immediately.

The reserved mark does not cause this. The scramble does, and the scramble is what makes
the mapping bijective and the decode exact. So detectability is a property of the baseline
codec, not of the watermark. Removing the mark would not fix it.

## Consequences for the project

1. **Do not claim undetectability.** Report this number. It is the honest starting point.
2. **The Results page must show this AUC**, not a placeholder. It is the "before" in the
   before/after that the v1 generator exists to improve.
3. **This is the strongest argument for the v1 generative encoder.** Its job is now
   concrete and measurable: move that AUC from 0.97 toward 0.5 without losing recovery.
4. **The verifier is unaffected.** Owner detection is a separate question and still works
   decisively (p = 1e-300 correct key, 0.79 wrong key). Detectability by an outsider and
   extractability by the owner are different axes; the project's contribution is the
   trade-off between them.

## Limits of this probe

- One classifier family, one feature set (4-mers), one organism, 200 nt windows.
- Trained and tested on region-disjoint windows, so the split is honest, but a CNN would
  likely push the AUC higher, not lower.
- This is a probe, not the shippable attacker. The evaluation harness should re-run it
  across window lengths and report confidence intervals.
