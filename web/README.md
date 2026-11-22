# TraceDNA — web

Local-only frontend for the TraceDNA prototype. Simulated channel; no DNA was
synthesised or sequenced.

## Run

```sh
npm install
npm run dev
```

Open the printed local URL. The app is a single-page walkthrough:

1. `/encode` — file to 200 nt strands with a reserved keyed mark.
2. `/channel` — substitution / insertion / deletion / dropout, with presets.
3. `/recover` — decode, SHA-256 comparison, pre/post-ECC BER.
4. `/verify` — sequence + key to a statistical verdict.
5. `/results` — saved evaluation table and sweeps, or an explicit empty state.

## Mock API

`src/lib/api.ts` is the only API surface. It currently delegates to the
deterministic generator in `src/lib/mock.ts`; there is no network call.

```
createSession()
encodeFile(file, recipient)
applyChannel(params)
recover()
verifySequence(seq, keyId)
getResults()
```

Replace the bodies with `fetch()` calls; the signatures and the artifact shapes
in `src/lib/types.ts` are the contract. `getResults()` intentionally returns
"no run" until `data/eval/results.json` exists — it never invents metrics.

## Stack notes

- Vite 8, React 19.3.1 (exact; R3F's peer range is `<19.4`), TypeScript 6.
- Tailwind CSS v4 via `@tailwindcss/vite`; one `@import "tailwindcss";`, no
  PostCSS or `tailwind.config.js`.
- `@/*` maps to `src/*` in both `vite.config.ts` and `tsconfig.app.json`
  (`paths` only; TS 6 rejects `baseUrl`).
- Fonts are bundled with `@fontsource/*` (Latin subsets), so the app is offline
  after `npm install`.
- Helix: hand-rolled R3F scene with instanced meshes, 24 bp, static by default.

## Build

```sh
npm run build
```

The evaluation table is produced by the sweep, not by this app:

```sh
cd engine && uv run python -m tracedna.eval.sweep
```
