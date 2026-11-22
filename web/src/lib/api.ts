/**
 * HTTP client for the TraceDNA engine.
 *
 * Vite proxies /api to the FastAPI process on :8000 (see vite.config.ts), so the
 * browser only ever talks to one origin. The session id is cached at module
 * scope; every call creates a session lazily if one does not exist yet.
 */

import { ApiError } from "./types"
import type { Artifact, Coder, SessionStub } from "./types"

const DETECT_GENE_COUNT = 120

let session: SessionStub | null = null
let pendingSession: Promise<SessionStub> | null = null

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function parseError(payload: unknown, response: Response): ApiError {
  const body = asRecord(payload)
  const nested = asRecord(body?.error) ?? asRecord(body?.detail)

  if (nested) {
    return new ApiError(
      asText(nested.code) ?? `http_${response.status}`,
      asText(nested.message) ?? `${response.status} ${response.statusText}`,
      asText(nested.hint) ?? "",
    )
  }

  if (typeof body?.detail === "string") {
    return new ApiError(`http_${response.status}`, body.detail, "")
  }

  if (Array.isArray(body?.detail)) {
    const first = asRecord(body.detail[0])
    return new ApiError(
      "validation",
      asText(first?.msg) ?? "Request validation failed.",
      "",
    )
  }

  return new ApiError(
    `http_${response.status}`,
    `${response.status} ${response.statusText}`,
    "",
  )
}

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
      // Non-JSON error body; parseError falls back to the status text.
    }
    throw parseError(payload, response)
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

function post<T>(path: string): Promise<T> {
  return request<T>(path, { method: "POST" })
}

async function ensureSession(): Promise<SessionStub> {
  if (session) return session

  if (!pendingSession) {
    pendingSession = post<SessionStub>("/api/session")
      .then((created) => {
        session = created
        return created
      })
      .catch((error: unknown) => {
        pendingSession = null
        throw error
      })
  }

  return pendingSession
}

/** Return the cached session, creating one on first use. */
export function createSession(): Promise<SessionStub> {
  return ensureSession()
}

export async function setCover(geneCount: number, coder: Coder): Promise<Artifact> {
  const current = await ensureSession()
  return postJson<Artifact>(`/api/session/${current.session_id}/cover`, {
    gene_count: geneCount,
    coder,
  })
}

export async function setMessageText(text: string): Promise<Artifact> {
  const current = await ensureSession()
  return postJson<Artifact>(`/api/session/${current.session_id}/message`, { text })
}

export async function setMessageFile(file: File): Promise<Artifact> {
  const current = await ensureSession()
  const form = new FormData()
  form.append("file", file)
  return request<Artifact>(`/api/session/${current.session_id}/message/upload`, {
    method: "POST",
    body: form,
  })
}

export async function embedMessage(): Promise<Artifact> {
  const current = await ensureSession()
  return post<Artifact>(`/api/session/${current.session_id}/embed`)
}

export async function damage(params: {
  coverage: number
  sub_rate: number
  seed: number
}): Promise<Artifact> {
  const current = await ensureSession()
  return postJson<Artifact>(`/api/session/${current.session_id}/channel`, params)
}

export async function recoverMessage(): Promise<Artifact> {
  const current = await ensureSession()
  return post<Artifact>(`/api/session/${current.session_id}/recover`)
}

export async function runDetector(): Promise<Artifact> {
  const current = await ensureSession()
  return postJson<Artifact>(`/api/session/${current.session_id}/detect`, {
    gene_count: DETECT_GENE_COUNT,
  })
}

export async function getSession(): Promise<Artifact> {
  const current = await ensureSession()
  return request<Artifact>(`/api/session/${current.session_id}`)
}
