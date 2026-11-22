# TraceDNA

DNA storage with keyed provenance. Encode a file into DNA strands, damage them with a
simulated sequencing channel, recover the file, and prove whose copy a bare sequence is.

Everything is simulated. No DNA is synthesised or sequenced, and the verifier returns
statistical evidence — not cryptographic or legal proof.

Design: [`docs/superpowers/specs/2026-11-22-tracedna-design.md`](docs/superpowers/specs/2026-11-22-tracedna-design.md)

## Requirements

| Tool | Version |
|---|---|
| Node | ≥ 22.12 (24 LTS or 26 both work) |
| Python | 3.12 or 3.13, managed by `uv` |
| uv | latest |

The system Python on this machine is 3.15, which is too new for PyTorch wheels. `uv`
installs and uses 3.12 from `engine/.python-version`; do not switch to the system Python.

## Setup

```sh
make setup          # uv sync (engine) + npm install (web)
```

## Run

```sh
make dev            # API on :8000, web on :5173
```

or separately:

```sh
make api            # cd engine && uv run uvicorn tracedna.api.main:app --reload --port 8000
make web            # cd web && npm run dev
```

Check the engine is wired up:

```sh
curl -s localhost:8000/api/health | jq
```

`codec: "missing: ImportError"` means the engine modules are not in place yet — that is a
health signal, not a crash.

## Test

```sh
make test           # engine: pytest · web: vitest
```

## Layout

```
engine/tracedna/
  config.py         frozen constants
  types.py          dataclasses shared by every module (the contract)
  codec/
    primitives.py   frozen: RS, crc8, scrambler, permutation, block layout
    encode.py       file -> strands
    decode.py       strands -> file
  channel/          substitutions, indels, dropout
  watermark/        keyed mark fields; tournament sampler (v1)
  verify/           keyed detector and binomial p-value
  api/              FastAPI session layer
web/
  src/pages/        the five steps
  src/lib/          artifact types, session state, API client
docs/
  superpowers/specs/...
data/               sessions and eval output (gitignored)
```

## The five steps

1. **Encode** — file → DNA for a chosen recipient
2. **Channel** — apply a named noise preset
3. **Recover** — decode back to the exact file
4. **Verify** — paste a sequence + key → p-value and recipient
5. **Results** — reproducibility table with seeds and confidence intervals

## Honest limits

- Simulated channel only. No wet lab, no synthesis, no sequencing.
- Statistical evidence, not encryption and not legal proof.
- The v0 mark lives inside a Reed–Solomon codeword, so it tolerates substitutions but not
  indels. That limitation is measured and reported; it is why the v1 sampler exists.
- Provenance identifies a **copy**, not a colluder. Tardos codes are a stretch goal.
- This is data provenance, not human forensic identification.
