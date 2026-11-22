# TraceDNA — Design Specification

**Date:** 2026-11-22
**Status:** Draft for review
**Scope:** Local-only prototype. No deployment, no wet lab.

---

## 1. Context

DNA data storage encodes digital files as synthetic DNA. Existing codecs optimise density,
biological constraints, and error recovery. They leave no way to answer a simple question
after the fact: **whose copy of this archive is this?**

TraceDNA is a local web application that stores a file in DNA strands and embeds a hidden,
key-driven provenance mark in those same strands. Given a DNA sequence and a secret key, the
system returns a statistical verdict: *was this produced by our encoder, and for which
recipient?*

Everything is simulated. No DNA is synthesised or sequenced.

### 1.1 The research question

> Can a per-recipient mark be embedded in DNA storage strands so that it survives synthesis-
> and sequencing-like noise, without making the stored DNA statistically easier to detect
> than unmarked DNA?

This is a **trade-off study**. The expected result may be negative, and that is an acceptable
outcome.

### 1.2 Why the mark is hard

A DNA storage encoder is deterministic: every payload bit fixes the nucleotides. There is no
spare randomness to hide a mark in. Therefore the project has an explicit arc:

| Version | Watermark mechanism | Cost |
|---|---|---|
| v0 | Reserved payload symbols: a keyed pseudo-random field multiplexed into the bitstream | Explicit. ~8% of nucleotides. Visible as structure. |
| v1 | Keyed tournament sampling over a generative encoder's base distribution | Target: near zero capacity cost, invisible to steganalysis |

v0 exists to give a working, honest baseline and a complete demo. v1 is the contribution.
If v1 fails to reach acceptable recovery, v0 remains the deliverable and the negative result
is reported.

---

## 2. Scope

### In scope

- File-to-DNA encoding with Reed–Solomon error correction and constraint reporting
- A discrete channel simulator: substitutions, insertions, deletions, strand dropout
- A keyed watermark, extractable from a sequence plus a key
- Per-recipient keys, so copies of the same file are distinguishable
- A statistical verifier returning a p-value, not a bit-exact extraction
- Independent steganalysis: a classifier trained to distinguish natural DNA from ours
- A five-page local web application
- A reproducible evaluation pipeline with saved configs and results

### Out of scope (state this in the report and the UI footer)

- Physical DNA synthesis, sequencing, storage, or stability
- Biological function, biosafety, or in-vivo use
- Cryptographic ownership proof. The verifier is statistical evidence, not legal proof.
- Human forensic identification. This is product/data provenance, not STR profiling.
- Deployment, authentication, multi-user accounts, cloud storage
- Collusion-resistant fingerprint codes in v0/v1 (see §7.4)

---

## 3. User and demo narrative

Single local user: the student, presenting to a professor. Five pages, walked in order,
one shared artifact carried across all of them.

**The demo, in the student's words:**

1. *"Here is a file. I encode it as DNA for Alice."* → Encode
2. *"Real DNA gets damaged. Here is the same archive with realistic noise."* → Channel
3. *"The file still comes back. Here is the error rate."* → Recover
4. *"Now the interesting part. I hand you only a DNA sequence and a key — no file, no
   database. Tell me whose it is."* → Verify
5. *"And here is whether any of this is detectable, and what it cost."* → Results

**Design constraint:** if a page needs scrolling to explain itself, the page is wrong.
One primary action, one result block.

---

## 4. Vocabulary (used consistently in code, UI, and report)

| Term | Meaning here |
|---|---|
| **Steganography** | Hiding the existence of a message. Success = detector AUC near 0.5. |
| **Watermark** | A mark proving origin. Success = the owner's detector succeeds. |
| **Fingerprint** | A per-recipient mark. Success = identifying which copy leaked. |
| **Strand** | One synthesised oligonucleotide, fixed length L = 200 nt. |
| **Recipient** | A named holder of a copy (Alice, Bob, Carol). Each gets a distinct key. |

The project deliberately reports **two AUCs** (§9). They point in opposite directions, and
that contrast is the intellectual content of the work.

---

## 5. Architecture

```
┌───────────────────────────── Browser (Vite + React) ─────────────────────────────┐
│  Encode   │   Channel   │   Recover   │   Verify   │   Results                    │
│           └──────── shared artifact (session JSON) ────────┘                      │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ HTTP / JSON (localhost:8000)
┌───────────────────────────────────▼───────────────────────────────────────────────┐
│                          FastAPI application (Python)                            │
│                                                                                   │
│  codec/        payload ⇄ bytes ⇄ RS codeword ⇄ bases ⇄ strands                    │
│  channel/      substitutions, indels, dropout, per-strand survival                │
│  watermark/    keyed PRF field (v0) · keyed tournament sampler (v1)               │
│  fingerprint/  recipient keys, identification, collusion test                     │
│  verify/       g-value scoring, binomial p-value, multi-window correction         │
│  attack/       steganalysis classifier (k-mer + XGBoost, CNN in v1)               │
│  eval/         sweep runner, metric aggregation, CSV/JSON output                  │
│                                                                                   │
│  PyTorch (v1 only) · numpy · scipy · reedsolo · scikit-learn · xgboost            │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │
                        data/  (sessions, reference genome, results)
```

Two processes, one command each. No database, no containers.

---

## 6. The artifact contract

Every page reads and mutates one JSON document. This is the spine of the app.

```jsonc
{
  "session_id": "s_01J...",
  "created_at": "2026-11-22T10:00:00Z",
  "file": { "name": "report.txt", "size": 1204, "sha256": "…" },
  "recipient": "alice",
  "key_id": "alice",
  "params": {
    "strand_length": 200,
    "ecc": { "scheme": "rs", "n": 50, "k": 34 },
    "outer": { "k": 12, "r": 4 },
    "scramble_seed": 167,
    "scramble": "fixed, key-independent",
    "watermark": { "mode": "reserved", "field_nt": 16, "bits": 32 },
    "payload_bytes_per_strand": 26
  },
  "strands": [
    { "index": 0, "seq": "ACGT…200nt", "payload_bytes": 26, "gc": 0.51,
      "max_homopolymer": 3, "marked": true }
  ],
  "stats": { "strand_count": 64, "nt_total": 12800, "bits_per_nt": 0.64 },
  "channel": { "sub": 0.0, "ins": 0.0, "del": 0.0, "dropout": 0.0,
               "seed": 1, "applied": false },
  "noisy_strands": [ { "index": 0, "seq": "…", "survived": true } ],
  "recovery": { "ok": true, "bytes_recovered": 1204, "ber_pre_ecc": 0.011,
                "ber_post_ecc": 0.0, "strands_in": 41, "strands_out": 38 },
  "verification": { "detected": true, "recipient": "alice",
                    "p_value": 0.0003, "score": 0.71, "null_mean": 0.5,
                    "windows": 4, "strands_scored": 38 }
}
```

Rules:

- The UI drives one active session; the API retains history as `data/sessions/<id>.json`.
- Pages never recompute a previous page's output; they read it.
- Any parameter change invalidates downstream fields (`noisy_strands`, `recovery`,
  `verification`) and the UI must show them as stale rather than silently reusing them.

---

## 7. Components

### 7.1 Codec (v0, deterministic)

**Encode**

1. Read file bytes. Record `sha256`.
2. Split into payload blocks sized by watermark mode: 30 bytes unmarked, 26 bytes reserved.
3. Build a 34-byte data block. Two layouts, selected by watermark mode:

   - `none`:     `[strand_index:2][valid_len:1][crc8:1][payload:30]`
   - `reserved`: `[strand_index:2][valid_len:1][crc8:1][mark:4][payload:26]`

   `valid_len` records how many payload bytes are meaningful in the final, padded block.
4. Reed–Solomon encode `RS(50, 34)` over GF(256) → 50-byte codeword.
5. Map to 200 nt: 2 bits per base, most-significant first.
6. Scramble: `symbol[i] = (symbol[i] + s[i]) mod 4`, where `s` is a deterministic
   pseudo-random stream from a fixed global seed. This is a bijection, so decoding is exact,
   while breaking up payload-correlated runs and balancing GC statistically.
7. Permute: `out[PERMUTATION[i]] = symbol[i]` with a fixed, key-independent permutation.
   This spreads the mark symbols across the whole strand instead of leaving them in a
   contiguous block.
8. Map each symbol to a base.
9. Record `gc` and `max_homopolymer` per strand. Do **not** silently repair; report.

The scrambler and permutation are both key-independent, so a decoder needs no side
information beyond the strand itself. Nothing in the encoder depends on a secret.

**Decode**

1. Unscramble using the seed read from the header positions.
2. Recover 50 bytes. RS decode. Verify CRC.
3. Concatenate payload blocks by strand index.
4. Compare against the original by `sha256`; compute pre-ECC and post-ECC BER.

**Why this layout:** 200 nt = 50 bytes at 2 bits/base. RS(50,34) leaves 34 data bytes.
Unmarked that is **1.20 bits/nt** gross; with the 4-byte reserved mark, **1.04 bits/nt** gross.

**Outer layer (cross-strand erasure coding).** Strands are grouped into stripes of
`OUTER_K = 12` data blocks plus `OUTER_R = 4` parity blocks. The outer code is a
Reed–Solomon code over GF(256) applied vertically, one byte column at a time, so any 12 of
the 16 strands in a stripe reconstruct that stripe. Without this layer a single dropped
strand loses the file, and no realistic channel is survivable.

Net density after the outer layer is **0.90 bits/nt** unmarked and **0.78 bits/nt** with the
reserved mark, for a full stripe. Real files round up to whole stripes, so the measured
figure is lower for small payloads (a 1 KB marked file lands at 0.64 bits/nt). Report the
measured value, never the nominal one. Constants live in one config module so the report can
quote them exactly.

### 7.2 Channel

Symmetric, per-nucleotide, order fixed as: substitution → insertion → deletion → dropout.

| Parameter | Range | Default presets |
|---|---|---|
| Substitution rate | 0 – 3% | Clean 0% · Realistic 0.5% · Harsh 2% |
| Insertion rate | 0 – 1% | 0% · 0.01% · 0.03% |
| Deletion rate | 0 – 1% | 0% · 0.01% · 0.03% |
| Strand dropout | 0 – 50% | 0% · 2% · 10% |

Per-base indel rates are an order of magnitude below substitution rates, matching
Illumina-class readout. An earlier draft used 0.1% per base, which is roughly 100× too
high: it destroyed a third of strands by frame-shifting alone and made whole-file recovery
impossible. The preset was corrected rather than the target.

- Deterministic given `(sub, ins, del, dropout, seed)`.
- Insertions sample a uniformly random base.
- The UI shows a one-strand before/after diff; the backend reports full statistics.
- Presets are named constants, not free-form defaults, so the demo and the evaluation use
  identical numbers.

### 7.3 Watermark

**v0 — reserved keyed field (explicit cost).**

- Reserve 16 nt per strand (32 bits) as a watermark field, interleaved across the strand
  rather than placed in a header block, so deletion of a prefix does not erase it.
- Field value = `PRF(key, strand_index, position_block)` truncated to the field length.
- Detection: recompute the PRF, count matching symbols, run a binomial test against the
  null (chance agreement = 1/2 per bit). A perfectly matching 32-bit mark is already strong
  evidence on its own (p ≈ 2e-10); pooling across strands is what keeps detection stable
  under damage and keeps the false-positive rate calibrated. The verdict aggregates over
  the strand set (see §7.5).
- **v0 requires an intact RS codeword.** It tolerates substitutions (up to 8 corrupted bytes
  per strand) but not indels or prefix truncation. That limitation is measured and reported
  honestly; it is the main motivation for v1, whose detector is position-independent.
- Reported cost: `32 bits / 200 nt = 0.16 bits/nt`. That is 8% of the strand length and
  13% of unmarked payload capacity (1.20 → 1.04 bits/nt gross; 0.90 → 0.78 after the outer
  erasure layer). The number is measured, not asserted.

**v1 — keyed tournament sampling (target: near-zero cost).**

Adapted from SynthID-Text's tournament construction:

1. At each position, obtain a candidate distribution from the generative encoder.
2. Derive a seed `r_t` from `(key, recipient, previous H bases)` with `H = 4`.
   **No absolute position is used** — this keeps detection position-independent, so it
   survives indels and works from any retained window or either strand.
3. Binary scoring functions `g_1 … g_m` (default `m = 8`) map `(candidate, r_t) → {0,1}`.
4. Run an `m`-layer knockout tournament over sampled candidates; the winner is emitted.
5. Over random keys the sampling distribution is unchanged; at a fixed key it is reweighted.

**v0 is the fallback.** If v1's recovery degrades beyond its acceptance threshold, v1 is
reported as a negative result and v0 is the shipped mechanism.

### 7.4 Fingerprint

- One key per recipient. Alice's copy and Bob's copy of the same file differ only in mark
  positions and mark values; payload and ECC are identical.
- Verification runs the detector for every known key and reports all keys with
  `p < alpha`, plus the best match.
- **Collusion is a stated limitation.** If Alice and Bob compare copies and mix strands, a
  per-recipient-key scheme attributes whatever strands are present but cannot identify
  colluders who contribute only unmarked or blended material. Tardos-style codes are
  specified as a stretch goal, not a v0/v1 commitment.
- The report must include the sentence: *"This scheme identifies a copy, not a colluder."*

### 7.5 Verifier

Input: `sequence`, `key`, optional `recipient`.

1. Score the sequence and its reverse complement, at every start offset, over four window
   lengths: 40, 80, 120, and 200 nt. No absolute position or fixed frame is assumed, so
   detection survives indels and works from any retained stretch.
2. Score each window: fraction of positions whose observed symbol scores 1 under the keyed
   `g`-function.
3. Aggregate within a window: `p = P(X ≥ count)` for `X ~ Binomial(n, 1/2)`. Across
   strands, pool the counts before the test, so 41 strands give 41× the evidence.
4. Correct for the number of windows searched (Bonferroni or the paper's correction) so the
   reported p-value is honest under the null.
5. Return `detected`, `recipient`, `p_value`, `score`, `null_mean = 0.5`,
   `windows_searched`.

**Calibration gate (v0).** Because the verifier can only score strands that RS-decode,
natural DNA yields `n = 0` and is never flagged; that null is trivial. The meaningful null is
a **wrong key**: on 1,000 unmarked strand sets encoded under one key and tested with another,
the empirical false-positive rate at `alpha = 0.01` must be ≤ 1.5%. If it is not, the
detector is not shippable. For v1 the null additionally includes natural *E. coli* windows,
because its detector does not require a codeword.

### 7.6 Steganalysis attacker

Two tiers, run independently of the verifier:

- **Tier A (always):** 4-mer frequency features + XGBoost classifier, trained on natural
  windows vs. our strands, evaluated on region-disjoint held-out windows.
- **Tier B (v1):** small 1D CNN over one-hot encoding.

Report ROC-AUC with a confidence interval, plus the confusion at the 1% FPR operating point.
A mark that is invisible to the owner's detector is a bug; a mark that is visible to the
attacker is a limitation. Both must be measured.

---

## 8. API

Base `http://localhost:8000`. All JSON. File upload as multipart.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/session` | Create a session, returns `session_id` |
| `POST` | `/api/session/{id}/file` | Upload file + recipient; returns strand summary |
| `POST` | `/api/session/{id}/encode` | Run codec + watermark; returns strands and stats |
| `POST` | `/api/session/{id}/channel` | Apply noise; returns noisy strands and survival stats |
| `POST` | `/api/session/{id}/recover` | Decode; returns file hash comparison and BERs |
| `POST` | `/api/session/{id}/verify` | Body: `{ sequence, key }`; returns verdict and p-value |
| `GET` | `/api/session/{id}` | Full artifact |
| `GET` | `/api/results` | Aggregated evaluation table for the Results page |
| `GET` | `/api/health` | Liveness, versions, checkpoint presence |

Errors return `{ "error": { "code", "message", "hint" } }` with a human-readable `hint`
shown in the UI. Encode failures (file too large, payload too small) are surfaced before
work starts, not after.

Limits: max upload 5 MB, max strands 4,096, max sequence paste 50,000 nt.

---

## 9. Evaluation protocol

**Data.** NCBI RefSeq `NC_000913.3` (*E. coli* K-12 MG1655). Split by genomic coordinate
into disjoint blocks before sampling any window, so no train/test window overlaps.
Train 80% / test 20%.

**Payloads.** A fixed set: one 1 KB text file, one 4 KB JSON, one 8 KB PNG.

**Sweeps.** Substitution `{0, 0.2, 0.5, 1, 2}%` × deletion `{0, 0.1, 0.5, 1}%`, insertion
matched to deletion, dropout `{0, 10, 30}%`, 5 seeds each.

**Baselines.** (a) direct 2-bit mapping + RS, no mark; (b) v0 reserved-field mark.

**Metrics.**

| Metric | Definition | Target |
|---|---|---|
| File recovery | Exact byte match after decode | 100% at Clean and Realistic |
| Post-ECC BER | Bit errors after RS decode | < 1e-3 at Realistic |
| Pre-ECC BER | Bit errors before RS decode | reported |
| Effective density | payload bits / total nt | reported, with and without mark |
| Mark cost | bytes/nt consumed by the mark | reported, measured |
| Verifier TPR | True positive rate at FPR = 1% | > 0.99 at Clean |
| Verifier FPR | Empirical, wrong-key null | ≤ 1.5% |
| Steganalysis AUC | Natural vs generated | ≈ 0.5 for v1 (goal) |
| Recipient ID accuracy | Correct recipient chosen | > 0.99 |
| Constraint health | GC mean/spread, max homopolymer, k-mer distance | reported |

Every table reports mean ± 95% CI over seeds, and names the seeds.

---

## 10. Frontend

Five routes. The navbar is the pipeline.

```
TraceDNA      1 Encode   2 Channel   3 Recover   4 Verify   5 Results
                                 file: report.txt · 41 strands · key: alice
```

### Page specifications

**1 · Encode** — Drop zone, recipient select (alice / bob / carol), `Load sample` button,
`Encode` button. Result: strand count, nt total, bits/nt, and the first three strands in a
monospace block with a `show mark positions` toggle (default **off**). Constraint health
inline: GC mean, max homopolymer.

**2 · Channel** — Three percentage sliders plus dropout, and the three named presets as
segmented buttons. Result: a single-strand before/after alignment with changed bases marked,
and a summary `38 / 41 strands survive · 1,204 → 1,187 nt`.

**3 · Recover** — One `Decode` button. Result: verdict, original vs recovered hash, pre/post
ECC BER, and a three-segment bar (strands in → strands surviving → bytes recovered).

**4 · Verify** — A paste box (or `use current strands`), key select, `Check`. One large
verdict block: detected / not detected, recipient, `p`, score vs null. A `try a wrong key`
toggle that demonstrates failure. This is the demo's centrepiece.

**5 · Results** — One metrics table (rows = noise preset, columns = the §9 metrics) and two
small line charts (recovery vs noise, steganalysis AUC vs mark strength). Values come from
a saved evaluation run; if no run exists, the page shows an explicit empty state naming the
command to produce one. No fabricated numbers, ever.

### Design system

| Token | Value |
|---|---|
| `--paper` | `#FAFAF8` |
| `--ink` | `#14140F` |
| `--ink-muted` | `#5C5C54` |
| `--rule` | `#E2E1DA` |
| `--verified` | `#1F6B4A` |
| `--damaged` | `#A33A22` |
| Base colours A / T / G / C | `#4A6FA5` / `#A35D3A` / `#4E7B52` / `#8A6A9E` (muted, used only in sequences and the helix) |

- Type: IBM Plex Sans (text) + IBM Plex Mono (sequences, numbers, labels), installed locally
  via `@fontsource/*` so the app works offline. No CDN.
- All numerals `font-variant-numeric: tabular-nums`.
- 4 px spacing base, 12-column grid, content max-width 1120 px.
- 1 px rules. No shadows, no gradients, no glass, no hero sections, no emoji.
- Motion limited to the strand-diff highlight and number transitions; respect
  `prefers-reduced-motion`.

### 3D helix panel

- Placement: a fixed-height (280 px) panel on Encode and Verify only. It is never the hero.
- Render a **20–30 base window**, not 200 nt. Instanced meshes.
- `autoRotate={false}` by default. Light background. No bloom, no glow, no starfield.
- Driven by our data: highlight mark positions and damaged bases via `selectedIndex`.
- Hand-rolled in `src/components/dna/HelixPanel.tsx` with instanced meshes. The vendored
  registry components were not used, which removes the third-party licence question
  entirely. One toolbar control: reset view.

---

## 11. Error handling

| Failure | Behaviour |
|---|---|
| Payload exceeds strand capacity | Reject before encoding, show required strand count |
| RS decode fails for a strand | Drop the strand, count it as an erasure, continue |
| Too many erasures | Return partial recovery with the exact missing byte ranges |
| Verification on a short sequence | Require ≥ 40 nt, explain the minimum |
| Wrong key | Return `detected: false`, never a low-confidence guess |
| Missing model checkpoint (v1) | Fall back to v0 and label it in the UI |
| Stale downstream state | Mark noisy/recovery/verification fields as stale |

No page may display a metric it did not compute in the current run.

---

## 12. Testing

- **Codec:** property test — random files of 1 B … 64 KB must round-trip exactly with a
  clean channel. Golden file for a fixed payload and seed.
- **Outer code:** a stripe with up to `OUTER_R` strands removed must reconstruct exactly;
  one more removal must fail cleanly rather than return a plausible wrong file.
- **Channel:** statistical test — realised rates within 10% of requested rates over 1e6
  nucleotides; determinism test for a fixed seed.
- **Watermark:** a set of 41 clean marked strands must give `p < 1e-9`; strands marked for
  one recipient must not be flagged under another recipient's key at `alpha = 0.01`; over
  1,000 wrong-key trials the p-values must be uniform (KS test against U(0,1)).
- **Verifier calibration:** the §7.5 false-positive gate runs as a test, not a manual check.
- **API:** every endpoint has a happy-path and one bad-input test.
- **Frontend:** Vitest for formatting and stale-state logic. Playwright for the five-page
  walkthrough, run once per milestone.

---

## 13. Milestones

| # | Deliverable | Acceptance |
|---|---|---|
| M0 | Repo scaffold, pinned deps, spec committed | `make dev` starts both processes; blank five-page shell renders |
| M1 | Codec + outer erasure code + channel + Recover, no mark | 1 KB file round-trips exactly at Clean **and** Realistic; BER table produced |
| M2 | v0 watermark + verifier | TPR > 0.99 at FPR 1% on clean strand sets; wrong key rejected |
| M3 | Fingerprint per recipient + Trace UI | Recipient identified at > 0.99 accuracy; measured mark cost reported |
| M4 | Steganalysis attacker + Results page | AUC with CI published; v0's visibility honestly reported |
| M5 | v1 tournament sampler (stretch) | Either beats v0's cost, or is reported as a negative result |
| M6 | Evaluation run + report assets | Full sweep, seeds, CIs, all figures reproducible from one command |

v0 through M3 is the guaranteed shippable path. M5 may fail; the project does not depend on it.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Learned generator does not converge | v0 is complete before v1 starts; M5 is explicitly optional |
| Watermark cannot be made invisible | The negative result *is* a result; report both AUCs |
| Verifier false positives | Calibration gate in §7.5 blocks release; null built from held-out genome |
| 3D hurts demo performance | Window rendering, instancing, static camera |
| Dependency breakage | Versions pinned in §15, lockfiles committed, `npm ls` checked at M0 |
| Scope creep | Five pages, five endpoints' worth of behaviour, no accounts, no deploy |

---

## 15. Pinned stack

**Frontend**

| Package | Pin | Note |
|---|---|---|
| Node | ≥ 22.12 | Local 26.13 works; 24 LTS is the conservative choice |
| vite | 8.x | `@vitejs/plugin-react` |
| react / react-dom | 19.3.x | Do **not** move to 19.4 |
| typescript | 6.x | |
| tailwindcss + `@tailwindcss/vite` | 4.3.x | No PostCSS, no `tailwind.config.js` |
| shadcn CLI | 4.21+ | `components.json`: `tailwind.config: ""` |
| recharts | 3.7.x | If charts blank: delete lockfile + `node_modules`, reinstall |
| three | ≥ 0.180, pinned | |
| `@react-three/fiber` | **≥ 9.8.2** | 9.8.0 added React 19.3 support; 9.7.0 breaks on 19.3 |
| `@react-three/drei` | 10.x | drei 10 peers with R3F 9 / React 19; drei 9 peers with R3F 8 |
| `react-router-dom` | 7.x | |
| `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` | latest | Offline fonts |

**Backend**

| Package | Note |
|---|---|
| Python | **pin 3.12 or 3.13 via `uv`** — system Python 3.15 is too new for PyTorch wheels |
| fastapi, uvicorn, python-multipart | |
| torch | v1 only |
| numpy, scipy | `scipy.stats.binom` for p-values |
| reedsolo | RS over GF(256) |
| scikit-learn, xgboost | steganalysis baseline |
| pyyaml | config files |

**Compatibility rules (verify at M0 with `npm ls` and `uv pip check`)**

1. R3F v9 pairs with React 19; v8 pairs with React 18. Never mix.
2. R3F peer range is `>=19 <19.4`. React 19.4 will need an explicit upgrade decision.
3. Tailwind v4 uses the Vite plugin only; `@import "tailwindcss";` and no config file.
4. The `@/*` alias must exist in **both** `vite.config.ts` and `tsconfig.app.json`.
   TypeScript 6 rejects `baseUrl`, so use `paths` alone.
5. Third-party shadcn registry components are vendored source, licence checked, never
   fetched at runtime.

---

## 16. Open questions

None blocking. Deferred decisions:

- **v1 model size:** the default is a lightweight learned re-ranker over the sampler, not a
  full conditional generator. A full generator needs a GPU and is attempted only if M4
  lands early. The choice is recorded in the M4 report.
- **Tardos codes:** attempted only if M0–M4 land early; otherwise the limitation in §7.4
  stands as written.

---

## 17. Definition of done

The prototype is done when a person can, on one laptop with no network:

1. Encode a file into DNA for a chosen recipient.
2. Damage it with a named noise preset.
3. Recover the exact file and see the error rates.
4. Paste a strand and a key and get a p-value and a recipient name.
5. Open Results and see a reproducible table with seeds and confidence intervals, including
   an explicit statement of what the mark cost and whether it was detectable.

---

## Appendix A — Design references

The visual direction is "scientific instrument", not "product landing page". These are the
sources the interface borrows from, and the specific patterns taken from each.

### A.1 References

| Source | What it is | Patterns to steal |
|---|---|---|
| **Distill.pub** — distill.pub | Interactive scientific articles | Narrow prose column (~700 px) while figures break out wider; figure captions written as *operating instructions* ("drag the slider"); one interactive control per figure; no navigation chrome inside the figure |
| **Observable / Observable Plot** — observablehq.com | Notebook-based data apps | Thin 1 px axes, no gridlines by default, muted palette; **direct labels on lines instead of legends**; one cell = one question, one output |
| **NCBI BLAST** — blast.ncbi.nlm.nih.gov | Sequence search results | Dense monospace alignment blocks with a thin annotation strip beneath; colour used only for semantic classes (match / mismatch / gap); numeric columns right-aligned, tabular |
| **UCSC Genome Browser** — genome.ucsc.edu | Genome tracks | Horizontal lane metaphor: one data type per track, stacked on a shared coordinate axis; fixed-width left-hand track labels in small type |
| **IGV.js** — igv.org | Embeddable genome viewer | Base-level colouring; hover gives the exact value instead of printing every value; toolbar reduced to a few icons |
| **Mol\* / PDBe** — molstar.org, ebi.ac.uk/pdbe | 3D structure viewers | 3D canvas inside a **bordered, fixed-height panel**; small icon toolbar; a caption naming exactly what the model is and is not; static by default, rotation user-initiated |
| **Benchling sequence viewer** — benchling.com | Lab sequence editor | Monospace sequence with per-base colour strip; features drawn as **slim ticks above the sequence**, never as badges or cards |
| **cobalt.tools** — cobalt.tools | Single-purpose utility | One input, one action, one result; the result replaces the form area; almost no navigation |
| **Excalidraw** — excalidraw.com | Canvas tool | Chrome recedes; the artifact occupies the page; a single floating toolbar |

### A.2 Anti-patterns

1. **Dark navy background + cyan glow + starfield + auto-rotating helix as a hero.** Seen in
   most student "DNA visualiser" repos. It reads as a portfolio piece and signals that the
   3D is decoration.
2. **Gradient text, "New ✨" badges, emoji section labels.** Immediate tell of generated UI.
3. **Card grids with drop shadows and large corner radii.** Turns a measurement into a
   dashboard.
4. **A hero headline plus a call-to-action** on a tool whose only real action is "encode".
5. **Animated counters and success confetti.** Undermines the "this is a measurement"
   framing; also a distraction in a viva.
6. **Legends with five series and a rainbow palette.** Use direct labels; the data has at
   most two conditions.

### A.3 Visual rules to adopt

1. Content max-width 1120 px; sequence and prose measure ≤ 760 px.
2. One rule colour (`--rule`), 1 px. No shadows anywhere in the app.
3. Colour carries meaning only: verified, damaged, and the four base colours. Everything
   else is ink or muted ink.
4. All numerals tabular; numeric columns right-aligned; a fixed number of decimal places per
   column.
5. Monospace for sequences, keys, hashes, and p-values.
6. Section labels: 11 px mono, small caps, letter-spacing 0.06em, placed above the block.
7. Every interactive control prints its current value beside it.
8. Every figure carries a one-sentence caption stating what it shows and how to interact.
9. Empty states name the exact command that fills them.
10. At most one accent-coloured interaction per page.

### A.4 The 3D panel

- Fixed 280 px height, hairline border, `--paper` fill, never full-bleed, never first on the
  page.
- Static by default (`autoRotate={false}`); rotation only on drag. Respect
  `prefers-reduced-motion`.
- Caption beneath, always: *"Schematic double helix, 24 bp window. Base geometry and
  secondary structure are not modelled."*
- Toolbar limited to three icon buttons: reset view, toggle base labels, fit to panel.
- Highlighting driven by `selectedIndex` from the artifact — the same indices shown in the
  sequence track, so the two views agree.
- Render 20–30 base pairs with instanced meshes, not the full 200 nt strand.
