/** Artifact contract shared by every page. Mirrors the codon-steganography API (snake_case on the wire). */

export type Coder = "uniform" | "usage"

export interface SessionStub {
  session_id: string
  created_at: string
}

interface CoverSelection {
  gene_count: number
}

interface CoverInfo {
  name: string
  nt: number
  codons: number
  gene_count: number
  sequence: string
  preview: string
  protein_preview: string
}

interface MessageInfo {
  name: string
  size: number
  sha256: string
  preview: string
}

interface CodonChange {
  codon_index: number
  cover: string
  stego: string
}

interface StegoInfo {
  sequence: string
  preview: string
  protein_identical: boolean
  protein_preview: string
  capacity_bytes: number
  bits_per_codon: number
  codon_count: number
  changed_nt: number
  diff: CodonChange[]
}

interface ChannelInfo {
  coverage: number
  sub_rate: number
  seed: number
  applied: boolean
  reads: number
  bases_read: number
  substitutions: number
  consensus_errors: number
}

interface RecoveryInfo {
  ok: boolean
  sha256: string | null
  length: number | null
  crc_ok: boolean
  error: string | null
  bits_read: number
  preview: string
  matches_original: boolean
}

interface DetectionInfo {
  auc: number
  tpr_at_1pct: number
  n_natural: number
  n_stego: number
  n_train: number
  n_test: number
  coder: Coder
}

interface CheckFlags {
  translatable: boolean
  stop_ok: boolean
  ecc: boolean
  marker: boolean
  crc: boolean
  sha: boolean
}

interface CheckDamage {
  coverage: number
  sub_rate: number
  consensus_errors: number
  substitutions: number
}

export interface CheckParams {
  sequence?: string
  passphrase: string
  coder?: Coder
  damage?: {
    coverage: number
    sub_rate: number
    seed: number
  }
}

export interface CheckResult {
  ok: boolean
  reason: string | null
  checks: CheckFlags
  passphrase: string
  fingerprint: string
  session_fingerprint: string | null
  crc_ok: boolean
  length: number | null
  preview: string
  bits_read: number
  coder: Coder
  damaged: CheckDamage | null
}

export interface KeyFingerprint {
  passphrase: string
  fingerprint: string
}

export interface Artifact {
  session_id: string
  created_at: string
  key_id: string
  key_fingerprint: string
  cover_selection: CoverSelection
  coder: Coder
  cover: CoverInfo | null
  message: MessageInfo | null
  stego: StegoInfo | null
  channel: ChannelInfo | null
  recovery: RecoveryInfo | null
  detection: DetectionInfo | null
  stale: string[]
}

export class ApiError extends Error {
  readonly code: string
  readonly hint: string

  constructor(code: string, message: string, hint: string) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.hint = hint
  }
}
