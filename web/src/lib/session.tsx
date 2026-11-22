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
  /** The latest artifact returned by the engine. Each mutation replaces it. */
  artifact: Artifact | null
  setArtifact: (artifact: Artifact) => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [artifact, setArtifactState] = useState<Artifact | null>(null)

  useEffect(() => {
    // Reserve a session as soon as the app mounts. Every API call also
    // ensures one, so a failure here is harmless until the user acts.
    void createSession().catch(() => undefined)
  }, [])

  const setArtifact = useCallback((next: Artifact) => {
    setArtifactState(next)
  }, [])

  const value = useMemo<SessionContextValue>(
    () => ({ artifact, setArtifact }),
    [artifact, setArtifact],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error("useSession must be used inside SessionProvider")
  return value
}
