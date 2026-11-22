import { useState } from "react"

import { verifySequence } from "@/lib/api"
import { describeError, type ErrorDescription } from "@/lib/errors"
import { useSession } from "@/lib/session"
import { RECIPIENTS, type Recipient, type Verification } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Page } from "@/components/common/Page"
import { EmptyState, ErrorNote } from "@/components/common/EmptyState"
import { VerdictBlock } from "@/components/common/VerdictBlock"
import { HelixPanel } from "@/components/dna/HelixPanel"

function alternateRecipient(current: Recipient): Recipient {
  const index = RECIPIENTS.indexOf(current)
  return RECIPIENTS[(index + 1) % RECIPIENTS.length]
}

function cleanLength(sequence: string): number {
  return sequence.toUpperCase().replace(/[^ACGT]/g, "").length
}

export function VerifyPage() {
  const { artifact, setArtifact, isStale, stale } = useSession()
  const [sequence, setSequence] = useState("")
  const [keyId, setKeyId] = useState<Recipient>(
    artifact?.recipient ?? "alice",
  )
  const [wrongKey, setWrongKey] = useState(false)
  const [verification, setVerification] = useState<Verification | null>(
    artifact?.verification ?? null,
  )
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorDescription | null>(null)

  const effectiveKey = wrongKey ? alternateRecipient(keyId) : keyId
  const staleVerification = isStale("verification")

  async function runCheck(useWrongKey?: boolean) {
    if (busy) return
    const wrong = useWrongKey ?? wrongKey
    const key = wrong ? alternateRecipient(keyId) : keyId
    setBusy(true)
    setError(null)
    try {
      const verdict = await verifySequence(sequence, key)
      setVerification(verdict)
      setDirty(false)
      if (artifact) {
        setArtifact(
          { ...artifact, verification: verdict },
          [...stale].filter((field) => field !== "verification"),
        )
      }
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  function toggleWrongKey() {
    const next = !wrongKey
    setWrongKey(next)
    setDirty(true)
    setError(null)
    if (!busy && cleanLength(sequence) >= 40) {
      void runCheck(next)
    }
  }

  const helixSequence = artifact?.strands[0]?.seq ?? sequence.replace(/[^ACGTacgt]/g, "").slice(0, 24)
  const helixMarks = artifact?.strands[0]?.mark_positions ?? []
  const showVerdict = Boolean(verification) && !dirty && !staleVerification

  return (
    <Page
      step="Step 4 / Verify"
      title="Whose copy is this?"
      description="Score the sequence and its reverse complement under a key, pooling counts across windows. The output is a p-value against a 0.5 null, not a bit-exact extraction."
    >
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void runCheck()
          }}
          className="min-w-0"
          aria-label="Verify a sequence"
        >
          <div className="flex items-baseline justify-between gap-4">
            <label htmlFor="sequence" className="label">
              Sequence
            </label>
            <span className="num text-[10.5px] text-ink-muted">
              {cleanLength(sequence)} nt
            </span>
          </div>
          <textarea
            id="sequence"
            value={sequence}
            onChange={(event) => {
              setSequence(event.target.value)
              setDirty(true)
              setError(null)
            }}
            spellCheck={false}
            placeholder="Paste one or more strands, at least 40 nt…"
            aria-describedby="sequence-hint"
            className="mt-1 h-[128px] w-full resize-y rounded-none border border-rule bg-paper p-2.5 font-mono text-[11px] leading-relaxed text-ink placeholder:text-ink-muted"
          />
          <p id="sequence-hint" className="mt-1 text-[10.5px] leading-relaxed text-ink-muted">
            One full 200 nt strand is ideal. Non-ACGT characters and labels are ignored. Maximum
            50,000 nt.
          </p>

          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={!artifact}
              onClick={() => {
                if (!artifact) return
                setSequence(
                  artifact.strands
                    .slice(0, 200)
                    .map((strand) => strand.seq)
                    .join("\n\n"),
                )
                setDirty(true)
                setError(null)
              }}
              className="text-[11px] text-ink underline decoration-rule underline-offset-2 disabled:text-ink-muted disabled:no-underline"
            >
              use current strands
            </button>
            <span className="num min-w-0 truncate text-[10px] text-ink-muted">
              {artifact ? `artifact: ${artifact.file.name}` : "no artifact"}
            </span>
          </div>

          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="label">Key</span>
              <span className="num text-[10.5px] text-ink-muted">
                effective: {effectiveKey}
              </span>
            </div>
            <Select
              value={keyId}
              onValueChange={(value) => {
                setKeyId(value as Recipient)
                setDirty(true)
                setError(null)
              }}
            >
              <SelectTrigger
                aria-label="Key"
                className="mt-1 h-8 w-full rounded-none border-rule bg-paper font-mono text-[12px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none border-rule font-mono">
                {RECIPIENTS.map((name) => (
                  <SelectItem key={name} value={name} className="text-[12.5px]">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-3 flex items-baseline justify-between gap-4">
            <span className="label">Try a wrong key</span>
            <span className="num text-[10.5px] text-ink-muted">
              {wrongKey ? `on · using ${effectiveKey}` : "off"}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={wrongKey}
            onClick={toggleWrongKey}
            className="mt-1.5 inline-flex items-center gap-2 py-0.5"
          >
            <span
              aria-hidden="true"
              className={cn(
                "relative inline-block h-2.5 w-4 border",
                wrongKey ? "border-ink bg-ink" : "border-ink-muted bg-paper",
              )}
            >
              <span
                className={cn(
                  "absolute top-0 h-[8px] w-[6px] bg-paper",
                  wrongKey ? "left-[8px]" : "left-0",
                )}
              />
            </span>
            <span className="text-[11px] text-ink">demonstrate failure</span>
          </button>

          <Button
            type="submit"
            size="lg"
            disabled={busy}
            className="mt-4 h-9 w-full rounded-none text-[12.5px]"
          >
            {busy ? "Checking…" : "Check"}
          </Button>

          {error ? (
            <div className="mt-4">
              <ErrorNote message={error.message} hint={error.hint} />
            </div>
          ) : null}
        </form>

        <section aria-labelledby="verify-result" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <h2 id="verify-result" className="label">
              Result
            </h2>
            <span className="num text-[10.5px] text-ink-muted">
              {wrongKey ? `wrong key: ${effectiveKey}` : `key: ${effectiveKey}`}
            </span>
          </div>

          {!showVerdict ? (
            <div className="mt-3">
              <EmptyState
                title={
                  verification && (dirty || staleVerification)
                    ? "Inputs changed"
                    : "No check yet"
                }
              >
                {verification && (dirty || staleVerification)
                  ? "Press Check to score the current sequence and key. The previous verdict is marked stale and is not reused."
                  : "Paste one or more strands, choose a key and press Check. The verdict, recipient, p-value and score appear here, with the 24 bp helix below."}
              </EmptyState>
            </div>
          ) : verification ? (
            <div className="mt-3 grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0">
                <VerdictBlock
                  detected={verification.detected}
                  recipient={verification.recipient}
                  pValue={verification.p_value}
                  score={verification.score}
                  nullMean={verification.null_mean}
                  note={
                    wrongKey
                      ? `Same sequence, wrong key (${effectiveKey}). A non-detection is the required output; there is no low-confidence guess. Statistical evidence, not proof of ownership.`
                      : "Statistical evidence, not proof of ownership. This scheme identifies a copy, not a colluder."
                  }
                />
                <p className="num mt-2 text-[10.5px] leading-relaxed text-ink-muted">
                  windows: {verification.windows} · strands scored:{" "}
                  {verification.strands_scored} · claimed key:{" "}
                  {verification.claimed_key ?? effectiveKey}
                </p>
                <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
                  Green rungs in the helix mark the first 24 bp of the active artifact&apos;s
                  strand 0. They show where the keyed field sits, not the values.
                </p>
              </div>
              <HelixPanel sequence={helixSequence} markPositions={helixMarks} />
            </div>
          ) : null}
        </section>
      </div>
    </Page>
  )
}
