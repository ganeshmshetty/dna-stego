/**
 * Deterministic mock of the TraceDNA API. No network. No random state.
 * The shapes here are the contract in spec §6.
 */

import {
  ApiError,
  RECIPIENTS,
  type Artifact,
  type ChannelSettings,
  type FileMeta,
  type NoisyStrand,
  type Recovery,
  type ResultsResponse,
  type SessionStub,
  type Strand,
  type StrandStats,
  type Verification,
} from "./types"

const BASES = ["A", "C", "G", "T"] as const
type Base = (typeof BASES)[number]

const STRAND_LENGTH = 200
const PAYLOAD_BYTES_PER_STRAND = 26
const MARK_NT = 16
const MAX_STRANDS = 4096
const MAX_PASTE_NT = 50_000
const MIN_SEQUENCE_NT = 40
const CREATED_AT = "2026-11-22T10:00:00Z"

let active: Artifact | null = null
let lastChannel = {
  substitutions: 0,
  insertions: 0,
  deletions: 0,
  ntIn: 0,
}

// --- deterministic primitives ---------------------------------------------

function fnv1a(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickBase(rand: () => number): Base {
  return BASES[Math.floor(rand() * BASES.length)]
}

function maxHomopolymer(seq: string): number {
  let best = 1
  let run = 1
  for (let i = 1; i < seq.length; i += 1) {
    run = seq[i] === seq[i - 1] ? run + 1 : 1
    best = Math.max(best, run)
  }
  return best
}

function gcFraction(seq: string): number {
  if (seq.length === 0) return 0
  let gc = 0
  for (const base of seq) {
    if (base === "G" || base === "C") gc += 1
  }
  return gc / seq.length
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/** A deterministic 64-hex stand-in for a decoded hash that does not match. */
function pseudoHash(seed: string): string {
  let out = ""
  for (let block = 0; block < 8; block += 1) {
    out += fnv1a(`${seed}:${block}`).toString(16).padStart(8, "0")
  }
  return out
}

function cloneArtifact(artifact: Artifact): Artifact {
  return structuredClone(artifact)
}

// --- watermark helpers -----------------------------------------------------

function markPositionsFor(strandIndex: number): number[] {
  const rand = mulberry32(fnv1a(`mark-positions:${strandIndex}`))
  const pool = Array.from({ length: STRAND_LENGTH }, (_, i) => i)
  for (let i = 0; i < MARK_NT; i += 1) {
    const j = i + Math.floor(rand() * (STRAND_LENGTH - i))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }
  return pool.slice(0, MARK_NT).sort((a, b) => a - b)
}

function markBase(recipient: string, strandIndex: number, position: number): Base {
  const rand = mulberry32(fnv1a(`mark-value:${recipient}:${strandIndex}:${position}`))
  return pickBase(rand)
}

function buildStrand(
  recipient: string,
  index: number,
  payloadBytes: number,
  fileSeed: string,
): Strand {
  const positions = markPositionsFor(index)
  const marked = new Set(positions)
  const rand = mulberry32(fnv1a(`sequence:${fileSeed}:${index}`))
  let seq = ""

  for (let i = 0; i < STRAND_LENGTH; i += 1) {
    let base: Base
    if (marked.has(i)) {
      base = markBase(recipient, index, i)
    } else {
      base = pickBase(rand)
      let guard = 0
      while (
        guard < 12 &&
        seq.length >= 3 &&
        seq[seq.length - 1] === base &&
        seq[seq.length - 2] === base &&
        seq[seq.length - 3] === base
      ) {
        base = pickBase(rand)
        guard += 1
      }
    }
    seq += base
  }

  return {
    index,
    seq,
    payload_bytes: payloadBytes,
    gc: round(gcFraction(seq), 4),
    max_homopolymer: maxHomopolymer(seq),
    marked: true,
    mark_positions: positions,
  }
}

// --- sample payload --------------------------------------------------------

/** A deterministic 1 KiB text payload; generated in the browser, never fetched. */
export function makeSampleFile(): File {
  const lines = [
    "TraceDNA sample payload",
    "=======================",
    "",
    "This report is generated in the browser so the demo works offline.",
    "It stands in for any file a user would archive in DNA.",
    "",
    "The encoder splits the bytes into 26-byte payload blocks, adds a",
    "header and a 32-bit keyed mark field, wraps each block in RS(50,34),",
    "and maps the codeword to 200 nucleotides at two bits per base.",
    "",
    "The mark is spread across the strand. It costs 32 bits per strand,",
    "which is 0.16 bits per nucleotide and about 13 percent of payload.",
    "",
    "Everything downstream is simulated. No DNA was synthesised.",
    "",
  ]
  let text = ""
  let n = 1
  while (text.length < 1024) {
    text += lines[(n - 1) % lines.length] + "\n"
    if (n % lines.length === 0) {
      text += `measurement row ${String(n).padStart(3, "0")}  value ${(n * 37) % 997}\n\n`
    }
    n += 1
  }
  return new File([text.slice(0, 1024)], "report.txt", { type: "text/plain" })
}

// --- session lifecycle -----------------------------------------------------

export function createSession(): Promise<SessionStub> {
  active = null
  return Promise.resolve({
    session_id: "s_local_0001",
    created_at: CREATED_AT,
  })
}

export async function encodeFile(file: File, recipient: string): Promise<Artifact> {
  if (!RECIPIENTS.includes(recipient as (typeof RECIPIENTS)[number])) {
    throw new ApiError("unknown_recipient", "Unknown recipient.", "Choose alice, bob, carol or dave.")
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length === 0) {
    throw new ApiError("empty_file", "The file is empty.", "Drop a file with at least one byte.")
  }

  const strandCount = Math.max(1, Math.ceil(bytes.length / PAYLOAD_BYTES_PER_STRAND))
  if (strandCount > MAX_STRANDS) {
    throw new ApiError(
      "file_too_large",
      `This file needs ${strandCount.toLocaleString("en-US")} strands.`,
      `The demo caps a session at ${MAX_STRANDS.toLocaleString("en-US")} strands (${(
        MAX_STRANDS * PAYLOAD_BYTES_PER_STRAND
      ).toLocaleString("en-US")} bytes with the reserved mark).`,
    )
  }

  const sha256 = await sha256Hex(bytes)
  const strands: Strand[] = []
  for (let i = 0; i < strandCount; i += 1) {
    const start = i * PAYLOAD_BYTES_PER_STRAND
    const payloadBytes = Math.min(PAYLOAD_BYTES_PER_STRAND, bytes.length - start)
    strands.push(buildStrand(recipient, i, payloadBytes, sha256))
  }

  const gcMean = strands.reduce((sum, strand) => sum + strand.gc, 0) / strands.length
  const gcVariance =
    strands.reduce((sum, strand) => sum + (strand.gc - gcMean) ** 2, 0) / strands.length
  const stats: StrandStats = {
    strand_count: strandCount,
    nt_total: strandCount * STRAND_LENGTH,
    bits_per_nt: round(
      (strandCount * PAYLOAD_BYTES_PER_STRAND * 8) / (strandCount * STRAND_LENGTH),
      4,
    ),
    gc_mean: round(gcMean, 4),
    gc_spread: round(Math.sqrt(gcVariance), 4),
    max_homopolymer: strands.reduce((best, strand) => Math.max(best, strand.max_homopolymer), 0),
  }

  const meta: FileMeta = { name: file.name, size: bytes.length, sha256 }
  active = {
    session_id: "s_local_0001",
    created_at: CREATED_AT,
    file: meta,
    recipient: recipient as Artifact["recipient"],
    key_id: recipient,
    params: {
      strand_length: STRAND_LENGTH,
      ecc: { scheme: "rs", n: 50, k: 34 },
      scramble_seed: 8412,
      watermark: { mode: "reserved", field_nt: MARK_NT, bits: 32 },
      payload_bytes_per_strand: PAYLOAD_BYTES_PER_STRAND,
    },
    strands,
    stats,
    channel: { sub: 0, ins: 0, del: 0, dropout: 0, seed: 1, applied: false },
  }
  lastChannel = { substitutions: 0, insertions: 0, deletions: 0, ntIn: 0 }
  return cloneArtifact(active)
}

export async function applyChannel(params: ChannelSettings): Promise<Artifact> {
  if (!active) {
    throw new ApiError(
      "no_session",
      "There is no encoded artifact.",
      "Start at 1 Encode and encode a file first.",
    )
  }

  const artifact = active
  const rand = mulberry32(
    fnv1a(
      `channel:${params.seed}:${params.sub}:${params.ins}:${params.del}:${params.dropout}`,
    ),
  )
  const events = { substitutions: 0, insertions: 0, deletions: 0, ntIn: 0 }
  const noisy: NoisyStrand[] = []

  for (const strand of artifact.strands) {
    events.ntIn += strand.seq.length
    if (rand() < params.dropout) {
      noisy.push({ index: strand.index, seq: "", survived: false })
      continue
    }

    let out = ""
    for (const original of strand.seq) {
      let base = original
      if (rand() < params.sub) {
        const alternatives = BASES.filter((candidate) => candidate !== base)
        base = alternatives[Math.floor(rand() * alternatives.length)]
        events.substitutions += 1
      }
      if (rand() < params.ins) {
        out += pickBase(rand)
        events.insertions += 1
      }
      if (rand() < params.del) {
        events.deletions += 1
        continue
      }
      out += base
    }

    noisy.push({ index: strand.index, seq: out, survived: out.length > 0 })
  }

  artifact.channel = {
    sub: params.sub,
    ins: params.ins,
    del: params.del,
    dropout: params.dropout,
    seed: params.seed,
    applied: true,
  }
  artifact.noisy_strands = noisy
  delete artifact.recovery
  delete artifact.verification
  lastChannel = events

  return cloneArtifact(artifact)
}

export async function recover(): Promise<Artifact> {
  if (!active) {
    throw new ApiError(
      "no_session",
      "There is no encoded artifact.",
      "Start at 1 Encode and encode a file first.",
    )
  }

  const artifact = active
  const strandsIn = artifact.strands.length
  const channelApplied = artifact.channel.applied && Boolean(artifact.noisy_strands)
  const surviving = channelApplied
    ? (artifact.noisy_strands ?? []).filter((strand) => strand.survived).length
    : strandsIn
  const preEcc = channelApplied && lastChannel.ntIn > 0
    ? (lastChannel.substitutions + lastChannel.insertions + lastChannel.deletions) /
      lastChannel.ntIn
    : 0
  const survival = strandsIn === 0 ? 0 : surviving / strandsIn
  const ok = !channelApplied || (survival >= 0.8 && preEcc <= 0.012)
  const bytesRecovered = ok
    ? artifact.file.size
    : Math.floor(artifact.file.size * survival * 0.9)

  const recovery: Recovery = {
    ok,
    bytes_recovered: bytesRecovered,
    ber_pre_ecc: round(preEcc, 6),
    ber_post_ecc: ok ? 0 : round(Math.min(0.05, preEcc * 0.3), 6),
    strands_in: strandsIn,
    strands_out: surviving,
    recovered_sha256: ok ? artifact.file.sha256 : pseudoHash(artifact.file.sha256),
  }

  artifact.recovery = recovery
  return cloneArtifact(artifact)
}

function parseChunks(text: string): string[] {
  return text
    .toUpperCase()
    .split(/[^ACGT]+/)
    .filter((chunk) => chunk.length >= MIN_SEQUENCE_NT)
    .slice(0, 512)
}

function bestMarkMatch(
  artifact: Artifact,
  sequence: string,
  key: string,
): { best: number; windows: number; chunks: number } {
  const chunks = parseChunks(sequence)
  let best = 0
  let windows = 0

  for (const chunk of chunks) {
    const windowsInChunk: string[] = []
    if (chunk.length <= STRAND_LENGTH) {
      windowsInChunk.push(chunk)
    } else {
      for (let offset = 0; offset + STRAND_LENGTH <= chunk.length; offset += 100) {
        windowsInChunk.push(chunk.slice(offset, offset + STRAND_LENGTH))
      }
    }

    for (const window of windowsInChunk) {
      windows += 1
      for (const strand of artifact.strands) {
        let compared = 0
        let matches = 0
        for (const position of strand.mark_positions) {
          if (position >= window.length) continue
          compared += 1
          if (window[position] === markBase(key, strand.index, position)) {
            matches += 1
          }
        }
        if (compared >= 4) {
          best = Math.max(best, matches / compared)
        }
      }
    }
  }

  return { best, windows, chunks: chunks.length }
}

export async function verifySequence(sequence: string, keyId: string): Promise<Verification> {
  const cleaned = sequence.toUpperCase().replace(/[^ACGT]/g, "")
  if (cleaned.length < MIN_SEQUENCE_NT) {
    throw new ApiError(
      "sequence_too_short",
      `The sequence has ${cleaned.length} nt.`,
      `The detector needs at least ${MIN_SEQUENCE_NT} nt. Paste one full 200 nt strand.`,
    )
  }
  if (cleaned.length > MAX_PASTE_NT) {
    throw new ApiError(
      "sequence_too_long",
      `The sequence has ${cleaned.length.toLocaleString("en-US")} nt.`,
      `Paste at most ${MAX_PASTE_NT.toLocaleString("en-US")} nt.`,
    )
  }

  const key = keyId.trim().toLowerCase()
  let detected = false
  let recipient: Verification["recipient"] = null
  let score = 0.5
  let windows = 4
  let strandsScored = 0

  if (active) {
    const matched = bestMarkMatch(active, sequence, key)
    strandsScored = matched.chunks
    windows = Math.max(4, matched.windows * 4)
    score = round(0.5 + 0.21 * matched.best, 4)
    if (key === active.recipient && matched.best >= 0.75) {
      detected = true
      recipient = active.recipient
    }
  }

  const pValue = detected
    ? 0.0003
    : round(0.35 + (fnv1a(`${cleaned}:${key}`) % 6000) / 10000, 4)

  const verdict: Verification = {
    detected,
    recipient,
    p_value: pValue,
    score,
    null_mean: 0.5,
    windows,
    strands_scored: strandsScored,
    claimed_key: key,
  }

  if (active) active.verification = verdict
  return structuredClone(verdict)
}

export function getResults(): Promise<ResultsResponse> {
  return Promise.resolve({
    available: false,
    command: "cd engine && uv run python -m tracedna.eval.sweep",
    message: "No evaluation run yet. The table is generated by the sweep, never fabricated.",
  })
}
