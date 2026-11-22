/** Artifact contract shared by every page. Mirrors spec §6 (snake_case on the wire). */

export const RECIPIENTS = ["alice", "bob", "carol", "dave"] as const
export type Recipient = (typeof RECIPIENTS)[number]

export const CHANNEL_PRESETS = {
  clean: { sub: 0, ins: 0, del: 0, dropout: 0 },
  realistic: { sub: 0.005, ins: 0.0001, del: 0.0001, dropout: 0.02 },
  harsh: { sub: 0.02, ins: 0.0003, del: 0.0003, dropout: 0.1 },
} as const

export type ChannelPresetName = keyof typeof CHANNEL_PRESETS

export interface SessionStub {
  session_id: string
  created_at: string
}

export interface FileMeta {
  name: string
  size: number
  sha256: string
}

export interface EccParams {
  scheme: "rs"
  n: number
  k: number
}

export interface WatermarkParams {
  mode: "reserved" | "none"
  field_nt: number
  bits: number
}

export interface CodecParams {
  strand_length: number
  ecc: EccParams
  scramble_seed: number
  watermark: WatermarkParams
  payload_bytes_per_strand: number
}

export interface Strand {
  index: number
  seq: string
  payload_bytes: number
  gc: number
  max_homopolymer: number
  marked: boolean
  /** Extra field for the sequence track. Positions are 0-based within this strand. */
  mark_positions: number[]
}

export interface StrandStats {
  strand_count: number
  nt_total: number
  bits_per_nt: number
  gc_mean: number
  gc_spread: number
  max_homopolymer: number
}

export interface ChannelParams {
  sub: number
  ins: number
  del: number
  dropout: number
  seed: number
  applied: boolean
}

export type ChannelSettings = Omit<ChannelParams, "applied">

export interface NoisyStrand {
  index: number
  seq: string
  survived: boolean
}

export interface Recovery {
  ok: boolean
  bytes_recovered: number
  /** Null when the channel left no full-length strand to compare against. */
  ber_pre_ecc: number | null
  /** Null when the recovered length differs from the reference. */
  ber_post_ecc: number | null
  strands_in: number
  strands_out: number
  /** Extra field: the hash of the decoded output, for the original-vs-recovered row. */
  recovered_sha256: string | null
}

export interface Verification {
  detected: boolean
  recipient: Recipient | null
  p_value: number
  score: number
  null_mean: number
  windows: number
  strands_scored: number
  /** Extra field: the key the caller supplied. */
  claimed_key?: string
}

export interface Artifact {
  session_id: string
  created_at: string
  file: FileMeta
  recipient: Recipient
  key_id: string
  params: CodecParams
  strands: Strand[]
  stats: StrandStats
  channel: ChannelParams
  noisy_strands?: NoisyStrand[]
  recovery?: Recovery
  verification?: Verification
}

export interface MetricsRow {
  preset: ChannelPresetName
  ber_post_ecc: number
  bits_per_nt: number
  steganalysis_auc: number
  verify_tpr_at_1pct_fpr: number
  id_accuracy: number
}

export interface SeriesPoint {
  x: number
  y: number
  ci_low?: number
  ci_high?: number
}

export interface EvaluationRun {
  available: true
  run_id: string
  created_at: string
  seeds: number[]
  metrics: MetricsRow[]
  recovery_vs_noise: SeriesPoint[]
  steganalysis_vs_mark_strength: SeriesPoint[]
}

export interface EvaluationUnavailable {
  available: false
  command: string
  message: string
}

export type ResultsResponse = EvaluationRun | EvaluationUnavailable

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
