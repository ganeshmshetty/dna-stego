import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { createSession } from "@/lib/api"
import type { Artifact } from "@/lib/types"

interface SessionContextValue {
  artifact: Artifact | null
  /** Artifact fields invalidated by a control change since they were computed. */
  stale: ReadonlySet<string>
  setArtifact: (artifact: Artifact, staleFields?: Iterable<string>) => void
  markStale: (fields: Iterable<string>) => void
  clearStale: (fields: Iterable<string>) => void
  isStale: (field: string) => boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [artifact, setArtifactState] = useState<Artifact | null>(null)
  const [stale, setStale] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    void createSession().catch(() => undefined)
  }, [])

  const setArtifact = useCallback(
    (next: Artifact, staleFields: Iterable<string> = []) => {
      setArtifactState(next)
      setStale(new Set(staleFields))
    },
    [],
  )

  const markStale = useCallback((fields: Iterable<string>) => {
    setStale((current) => new Set([...current, ...fields]))
  }, [])

  const clearStale = useCallback((fields: Iterable<string>) => {
    setStale((current) => {
      const next = new Set(current)
      for (const field of fields) next.delete(field)
      return next
    })
  }, [])

  const isStale = useCallback((field: string) => stale.has(field), [stale])

  const value = useMemo<SessionContextValue>(
    () => ({ artifact, stale, setArtifact, markStale, clearStale, isStale }),
    [artifact, stale, setArtifact, markStale, clearStale, isStale],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error("useSession must be used inside SessionProvider")
  return value
}
