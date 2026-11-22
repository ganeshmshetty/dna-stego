import { useEffect, useState } from "react"

import { keyFingerprint } from "@/lib/api"

interface FingerprintState {
  passphrase: string
  fingerprint: string | null
  loading: boolean
}

interface PassphraseFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
}

export function PassphraseField({ id, value, onChange }: PassphraseFieldProps) {
  const [state, setState] = useState<FingerprintState | null>(null)
  const passphrase = value.trim()

  useEffect(() => {
    if (!passphrase) return
    let active = true

    const timer = window.setTimeout(() => {
      if (!active) return
      setState({ passphrase, fingerprint: null, loading: true })
      keyFingerprint(passphrase)
        .then((result) => {
          if (!active) return
          setState({ passphrase, fingerprint: result.fingerprint, loading: false })
        })
        .catch(() => {
          if (!active) return
          setState({ passphrase, fingerprint: null, loading: false })
        })
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [passphrase])

  const current = state && state.passphrase === passphrase ? state : null
  const display = !passphrase
    ? "—"
    : current
      ? current.loading
        ? "…"
        : (current.fingerprint ?? "—")
      : "…"

  return (
    <div>
      <label htmlFor={id} className="label">
        Passphrase
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={200}
        required
        aria-describedby={`${id}-hint ${id}-fingerprint`}
        className="mt-1 h-8 w-full rounded-none border border-rule bg-paper px-2.5 font-mono text-[12px] text-ink placeholder:text-ink-muted"
      />
      <p
        id={`${id}-hint`}
        className="mt-1 text-[10.5px] leading-relaxed text-ink-muted"
      >
        Symmetric key. The same secret embeds and extracts.
      </p>
      <p
        id={`${id}-fingerprint`}
        aria-live="polite"
        className="num mt-1 text-[10.5px] leading-relaxed text-ink"
      >
        SHA-256 →{" "}
        <span className={display === "—" || display === "…" ? "text-ink-muted" : undefined}>
          {display}
        </span>
      </p>
    </div>
  )
}
