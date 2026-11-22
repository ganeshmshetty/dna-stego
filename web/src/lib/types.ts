/** Artifact contract shared by every page. Mirrors the codon-steganography API (snake_case on the wire). */

export type Coder = "uniform" | "usage"

export interface SessionStub {
  session_id: string
  created_at: string
}

export interface CoverSelection {
  gene_count: number
}

export interface CoverInfo {
  name: string
  nt: number
  codons: number
  gene_count: number
  preview: string
  protein_preview: string
}

export interface MessageInfo {
  name: string
  size: number
  sha256: string
  preview: string
}

export interface CodonChange {
  codon_index: number
  cover: string
  stego: string
}

export interface StegoInfo {
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

export interface ChannelInfo {
  coverage: number
  sub_rate: number
  seed: number
  applied: boolean
  reads: number
  bases_read: number
  substitutions: number
  consensus_errors: number
}

export interface RecoveryInfo {
  ok: boolean
  sha256: string | null
  length: number | null
  crc_ok: boolean
  error: string | null
  bits_read: number
  preview: string
  matches_original: boolean
}

export interface DetectionInfo {
  auc: number
  tpr_at_1pct: number
  n_natural: number
  n_stego: number
  n_train: number
  n_test: number
  coder: Coder
}

export interface Artifact {
  session_id: string
  created_at: string
  key_id: string
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
