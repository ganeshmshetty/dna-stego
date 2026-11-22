/**
 * HTTP client for the TraceDNA engine.
 *
 * These signatures are the contract the pages depend on. In development, Vite
 * proxies /api to the FastAPI process on :8000 (see vite.config.ts), so the
 * browser only ever talks to one origin and there is no CORS surface.
 */

import { ApiError } from "./types"
import type {
  Artifact,
  ChannelSettings,
  Recipient,
  ResultsResponse,
  SessionStub,
  Verification,
} from "./types"

let session: SessionStub | null = null

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new ApiError(
      "network",
      "Cannot reach the engine on port 8000.",
      "Start it with `make api`, then reload this page.",
    )
  }

  if (!response.ok) {
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      // Non-JSON error body; fall back to the status text below.
    }
    const record = (payload ?? {}) as Record<string, unknown>
    const inner = (record.error ?? record.detail ?? {}) as Record<string, unknown>
    throw new ApiError(
      String(inner.code ?? `http_${response.status}`),
      String(inner.message ?? `${response.status} ${response.statusText}`),
      String(inner.hint ?? ""),
    )
  }

  return (await response.json()) as T
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function ensureSession(): Promise<SessionStub> {
  if (!session) {
    session = await request<SessionStub>("/api/session", { method: "POST" })
  }
  return session
}

export async function createSession(): Promise<SessionStub> {
  return ensureSession()
}

export async function encodeFile(file: File, recipient: Recipient): Promise<Artifact> {
  const current = await ensureSession()
  const form = new FormData()
  form.append("file", file)
  form.append("recipient", recipient)
  await request(`/api/session/${current.session_id}/file`, { method: "POST", body: form })
  return postJson<Artifact>(`/api/session/${current.session_id}/encode`, {
    recipient,
    watermark_mode: "reserved",
  })
}

export async function applyChannel(params: ChannelSettings): Promise<Artifact> {
  const current = await ensureSession()
  return postJson<Artifact>(`/api/session/${current.session_id}/channel`, {
    sub: params.sub,
    ins: params.ins,
    delete: params.del,
    dropout: params.dropout,
    seed: params.seed,
  })
}

export async function recover(): Promise<Artifact> {
  const current = await ensureSession()
  return request<Artifact>(`/api/session/${current.session_id}/recover`, { method: "POST" })
}

export async function verifySequence(seq: string, keyId: string): Promise<Verification> {
  const current = await ensureSession()
  return postJson<Verification>(`/api/session/${current.session_id}/verify`, {
    sequence: seq,
    key_id: keyId,
  })
}

export async function getResults(): Promise<ResultsResponse> {
  return request<ResultsResponse>("/api/results")
}
