import { useState, type FormEvent } from "react"

import { check } from "@/lib/api"
import { describeError, type ErrorDescription } from "@/lib/errors"
import { fmtInt, fmtPct } from "@/lib/format"
import { useSession } from "@/lib/session"
import type { CheckParams, CheckResult, Coder } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CoderPicker } from "@/components/common/CoderPicker"
import { EmptyState, ErrorNote } from "@/components/common/EmptyState"
import { Page } from "@/components/common/Page"
import { PassphraseField } from "@/components/common/PassphraseField"
import { VerdictBlock } from "@/components/common/VerdictBlock"

type CheckKey = keyof CheckResult["checks"]

const CHECK_ROWS: Array<{ key: CheckKey; description: string }> = [
  { key: "translatable", description: "reading frame is valid" },
  { key: "stop_ok", description: "no internal stop codon" },
  { key: "ecc", description: "error correction succeeded" },
  { key: "marker", description: "message marker found" },
  { key: "crc", description: "CRC-32 matches" },
  { key: "sha", description: "SHA-256 matches this session's original" },
]

function countBases(value: string): number {
  let count = 0
  for (const base of value.toUpperCase()) {
    if (base === "A" || base === "C" || base === "G" || base === "T") count += 1
  }
  return count
}

export function VerifyPage() {
  const { artifact } = useSession()
  const stego = artifact?.stego ?? null
  const cover = artifact?.cover ?? null
  const sessionPassphrase = artifact?.key_id ?? "alice"
  const sessionCoder: Coder = artifact?.coder ?? "usage"
  const otherCoder: Coder = sessionCoder === "usage" ? "uniform" : "usage"

  const [sequence, setSequence] = useState("")
  const [passphrase, setPassphrase] = useState(sessionPassphrase)
  const [coder, setCoder] = useState<Coder>(sessionCoder)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<ErrorDescription | null>(null)

  const hasSequence = sequence.trim().length > 0
  const bases = countBases(sequence)
  const invalidSequence = hasSequence && bases === 0
  const canCheck =
    !checking &&
    passphrase.trim().length > 0 &&
    !invalidSequence &&
    (hasSequence || Boolean(stego))

  async function runCheck(params: CheckParams, label: string) {
    if (checking) return
    setChecking(true)
    setError(null)
    try {
      const next = await check(params)
      setResult(next)
      setLastAction(label)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setChecking(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCheck) return
    const params: CheckParams = { passphrase, coder }
    if (hasSequence) params.sequence = sequence
    void runCheck(params, "check")
  }

  return (
    <Page
      step="Step 4 / Verify"
      title="Check the key, coder and sequence"
      description="Run the extraction stages against any sequence without changing the session. A recovered payload must clear the reading frame, stop, ECC, marker, CRC and SHA-256 checks."
    >
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="min-w-0">
          <form
            onSubmit={submit}
            className="min-w-0"
            aria-label="Verify a sequence"
          >
            <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
              <h2 className="label">A · Sequence</h2>
              <button
                type="button"
                disabled={!stego || checking}
                onClick={() => {
                  if (!stego) return
                  setSequence(stego.sequence)
                  setError(null)
                }}
                className="text-[10.5px] leading-tight text-ink underline decoration-rule underline-offset-2 disabled:text-ink-muted disabled:no-underline"
              >
                use current stego
              </button>
            </div>

            <div className="mt-3">
              <label htmlFor="verify-sequence" className="label">
                Sequence
              </label>
              <textarea
                id="verify-sequence"
                value={sequence}
                onChange={(event) => {
                  setSequence(event.target.value)
                  setError(null)
                }}
                spellCheck={false}
                placeholder="Paste an ACGT sequence, or leave empty to check the current stego."
                className="mt-1 h-[160px] w-full resize-y rounded-none border border-rule bg-paper p-2.5 font-mono text-[10px] leading-relaxed text-ink placeholder:text-ink-muted"
              />
              <p
                className={cn(
                  "num mt-1 text-[10px] leading-relaxed",
                  invalidSequence ? "text-damaged" : "text-ink-muted",
                )}
              >
                {invalidSequence
                  ? "No ACGT bases found in that input."
                  : hasSequence
                    ? `${fmtInt(bases)} ACGT bases.`
                    : "Empty sequence uses the current stego sequence."}
              </p>
            </div>

            <div className="mt-5 flex items-baseline justify-between gap-4 border-b border-rule pb-2">
              <h2 className="label">B · Key and coder</h2>
              <span className="num text-[10.5px] text-ink-muted">
                session coder: {sessionCoder}
              </span>
            </div>

            <div className="mt-3">
              <PassphraseField
                id="verify-passphrase"
                value={passphrase}
                onChange={(next) => {
                  setPassphrase(next)
                  setError(null)
                }}
              />
            </div>

            <div className="mt-4">
              <CoderPicker
                value={coder}
                onChange={(next) => {
                  setCoder(next)
                  setError(null)
                }}
                name="verify-coder"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={!canCheck}
              className="mt-5 h-9 w-full rounded-none text-[12.5px]"
            >
              {checking ? "Checking…" : "Check"}
            </Button>

            {!stego && !hasSequence ? (
              <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
                Embed a message on 1 Embed first, or paste a sequence to check.
              </p>
            ) : null}

            {error ? (
              <div className="mt-4">
                <ErrorNote message={error.message} hint={error.hint} />
              </div>
            ) : null}
          </form>

          <section aria-labelledby="failure-lab" className="mt-8 border-t border-rule pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="failure-lab" className="label">
                C · Failure lab
              </h2>
              <span className="num text-[10.5px] text-ink-muted">same result block</span>
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink-muted">
              Each button runs a check with deliberately wrong input. The result replaces the
              block above.
            </p>

            <div className="mt-3 grid gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!stego || checking}
                onClick={() =>
                  void runCheck({ passphrase: "bob" }, "wrong key")
                }
                className="h-auto min-h-[58px] flex-col items-start justify-center rounded-none border-rule px-3 py-2 text-left font-normal whitespace-normal"
              >
                <span className="text-[12px] leading-none font-medium text-ink">
                  Wrong key
                </span>
                <span className="mt-1 text-[10px] leading-snug text-ink-muted">
                  different passphrase → fingerprint mismatch
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={!stego || checking}
                onClick={() =>
                  void runCheck(
                    { passphrase: sessionPassphrase, coder: otherCoder },
                    "wrong coder",
                  )
                }
                className="h-auto min-h-[58px] flex-col items-start justify-center rounded-none border-rule px-3 py-2 text-left font-normal whitespace-normal"
              >
                <span className="text-[12px] leading-none font-medium text-ink">
                  Wrong coder
                </span>
                <span className="mt-1 text-[10px] leading-snug text-ink-muted">
                  checked as {otherCoder} → decode failure
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={!cover || checking}
                onClick={() => {
                  if (!cover) return
                  void runCheck(
                    { passphrase: sessionPassphrase, sequence: cover.sequence },
                    "real dna",
                  )
                }}
                className="h-auto min-h-[58px] flex-col items-start justify-center rounded-none border-rule px-3 py-2 text-left font-normal whitespace-normal"
              >
                <span className="text-[12px] leading-none font-medium text-ink">
                  Real DNA
                </span>
                <span className="mt-1 text-[10px] leading-snug text-ink-muted">
                  cover sequence → no embedded message
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={!stego || checking}
                onClick={() =>
                  void runCheck(
                    {
                      passphrase: sessionPassphrase,
                      damage: { coverage: 1, sub_rate: 0.05, seed: 2 },
                    },
                    "too much damage",
                  )
                }
                className="h-auto min-h-[58px] flex-col items-start justify-center rounded-none border-rule px-3 py-2 text-left font-normal whitespace-normal"
              >
                <span className="text-[12px] leading-none font-medium text-ink">
                  Too much damage
                </span>
                <span className="mt-1 text-[10px] leading-snug text-ink-muted">
                  1× coverage, 5% substitution → decode failure
                </span>
              </Button>
            </div>

            {!stego ? (
              <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
                Embed a message first; the failure lab checks this session&apos;s stego
                sequence.
              </p>
            ) : null}
          </section>
        </div>

        <section aria-labelledby="verify-result" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <h2 id="verify-result" className="label">
              Result
            </h2>
            <span className="num text-[10.5px] text-ink-muted">
              {checking ? "checking…" : result ? (lastAction ?? "check") : "no check"}
            </span>
          </div>

          {!result ? (
            <div className="mt-3">
              <EmptyState
                title={checking ? "Running extraction stages" : "No check yet"}
              >
                {checking
                  ? "Comparing the sequence against the session's key and coder. The checks table appears when the run completes."
                  : "Paste a sequence or use the current stego, choose a passphrase and coder, then press Check. The verdict and the six stage checks appear here."}
              </EmptyState>
            </div>
          ) : (
            <div className="mt-3">
              <VerdictBlock
                ok={result.ok}
                verdict={result.ok ? "RECOVERED" : "FAILED"}
                aside={result.damaged ? "damaged input" : "six stages"}
              >
                <Table className="text-[11.5px]">
                  <TableHeader>
                    <TableRow className="border-rule hover:bg-transparent">
                      <TableHead className="label h-8 w-[34%] px-4 text-left">
                        Stage
                      </TableHead>
                      <TableHead className="label h-8 w-[58px] px-2 text-center">
                        Result
                      </TableHead>
                      <TableHead className="label h-8 px-4 text-left">Meaning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {CHECK_ROWS.map((row) => {
                      const passed = result.checks[row.key]
                      return (
                        <TableRow key={row.key} className="border-rule hover:bg-transparent">
                          <TableCell className="num px-4 py-2 text-[11px] text-ink">
                            {row.key}
                          </TableCell>
                          <TableCell className="px-2 py-2 text-center">
                            <span
                              aria-hidden="true"
                              className={cn(
                                "font-mono text-[13px] leading-none",
                                passed ? "text-verified" : "text-damaged",
                              )}
                            >
                              {passed ? "✓" : "×"}
                            </span>
                            <span className="sr-only">
                              {passed ? "pass" : "fail"}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-2 text-[11.5px] leading-snug text-ink-muted">
                            {row.description}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                {result.reason ? (
                  <p
                    role="alert"
                    className="border-t border-rule px-4 py-3 text-[12px] leading-relaxed break-words text-damaged"
                  >
                    {result.reason}
                  </p>
                ) : null}

                {result.ok ? (
                  <div className="border-t border-rule px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <p className="label">Message preview</p>
                      <span className="num text-[10.5px] text-ink-muted">
                        {result.length === null ? "—" : `${fmtInt(result.length)} B`}
                      </span>
                    </div>
                    <pre className="mt-2 min-h-[64px] border border-rule bg-paper p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-ink">
                      {result.preview || "No bytes returned."}
                    </pre>
                  </div>
                ) : null}

                <div className="grid border-t border-rule sm:grid-cols-2">
                  <div className="border-b border-rule px-4 py-3 sm:border-b-0 sm:border-r">
                    <p className="label">Supplied fingerprint</p>
                    <p className="num mt-1 text-[11px] leading-relaxed text-ink">
                      {result.fingerprint}
                    </p>
                    <p className="num mt-0.5 text-[10px] leading-relaxed text-ink-muted">
                      passphrase: {result.passphrase}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="label">Session fingerprint</p>
                    <p className="num mt-1 text-[11px] leading-relaxed text-ink">
                      {result.session_fingerprint ?? "—"}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-ink-muted">
                      session key
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-rule px-4 py-2 text-[10.5px] leading-relaxed text-ink-muted">
                  <span className="num">coder: {result.coder}</span>
                  <span className="num">{fmtInt(result.bits_read)} bits read</span>
                  {result.damaged ? (
                    <span className="num">
                      damage: {result.damaged.coverage}× ·{" "}
                      {fmtPct(result.damaged.sub_rate, 2)} ·{" "}
                      {fmtInt(result.damaged.consensus_errors)} consensus errors ·{" "}
                      {fmtInt(result.damaged.substitutions)} substitutions
                    </span>
                  ) : (
                    <span>no extra damage</span>
                  )}
                </div>
              </VerdictBlock>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
