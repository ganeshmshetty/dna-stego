import { useState } from "react"
import { Link } from "react-router-dom"

import { damage } from "@/lib/api"
import { describeError, type ErrorDescription } from "@/lib/errors"
import { fmtInt, fmtPct } from "@/lib/format"
import { useSession } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { EmptyState, ErrorNote } from "@/components/common/EmptyState"
import { FieldRow } from "@/components/common/FieldRow"
import { Page } from "@/components/common/Page"

const SEED = 1
const DEFAULT_COVERAGE = 5
const DEFAULT_SUB_PCT = 0.2

export function DamagePage() {
  const { artifact, setArtifact } = useSession()
  const [coverage, setCoverage] = useState(artifact?.channel?.coverage ?? DEFAULT_COVERAGE)
  const [subPct, setSubPct] = useState(
    artifact?.channel ? artifact.channel.sub_rate * 100 : DEFAULT_SUB_PCT,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorDescription | null>(null)

  const stego = artifact?.stego ?? null
  const channel = artifact?.channel ?? null

  async function submit() {
    if (busy || !stego) return
    setBusy(true)
    setError(null)
    try {
      const next = await damage({
        coverage,
        sub_rate: subPct / 100,
        seed: SEED,
      })
      setArtifact(next)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      step="Step 3 / Damage"
      title="Sequence the stego DNA"
      description="Substitution-only model. Molecular indels would frameshift the protein and are out of scope; read-level indels need alignment."
    >
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="min-w-0"
          aria-label="Simulate sequencing"
        >
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <span className="label">Input</span>
            <span className="num text-[10.5px] text-ink-muted">
              {stego ? `${fmtInt(stego.sequence.length)} nt stego` : "no stego sequence"}
            </span>
          </div>

          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-4">
              <span id="coverage-label" className="label">
                Coverage
              </span>
              <span className="num text-[11px] text-ink">{coverage}×</span>
            </div>
            <Slider
              aria-labelledby="coverage-label"
              className="mt-2.5"
              min={1}
              max={60}
              step={1}
              value={[coverage]}
              disabled={!stego}
              onValueChange={(next) => {
                setCoverage(next[0] ?? 1)
                setError(null)
              }}
            />
            <div className="num mt-1 flex justify-between text-[9.5px] text-ink-muted">
              <span>1×</span>
              <span>60×</span>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-4">
              <span id="sub-label" className="label">
                Substitution rate
              </span>
              <span className="num text-[11px] text-ink">{subPct.toFixed(2)}%</span>
            </div>
            <Slider
              aria-labelledby="sub-label"
              className="mt-2.5"
              min={0}
              max={2}
              step={0.05}
              value={[subPct]}
              disabled={!stego}
              onValueChange={(next) => {
                setSubPct(next[0] ?? 0)
                setError(null)
              }}
            />
            <div className="num mt-1 flex justify-between text-[9.5px] text-ink-muted">
              <span>0%</span>
              <span>2%</span>
            </div>
          </div>

          <div className="mt-4 flex items-baseline justify-between gap-4">
            <span className="label">Seed</span>
            <span className="num text-[11px] text-ink">{SEED}</span>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={busy || !stego}
            className="mt-5 h-9 w-full rounded-none text-[12.5px]"
          >
            {busy ? "Sequencing…" : "Sequence it"}
          </Button>

          {!stego ? (
            <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
              Embed a message on{" "}
              <Link to="/embed" className="text-ink underline decoration-rule underline-offset-2">
                2 Embed
              </Link>{" "}
              first; sequencing edits the active stego sequence.
            </p>
          ) : null}

          {error ? (
            <div className="mt-4">
              <ErrorNote message={error.message} hint={error.hint} />
            </div>
          ) : null}
        </form>

        <section aria-labelledby="damage-result" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <h2 id="damage-result" className="label">
              Result
            </h2>
            <span className="num text-[10.5px] text-ink-muted">
              {channel ? `${channel.coverage}× · seed ${channel.seed}` : "no reads"}
            </span>
          </div>

          {!stego ? (
            <div className="mt-3">
              <EmptyState title="Embed a message first">
                Sequencing needs a stego sequence. Embed a message on{" "}
                <Link to="/embed" className="text-ink underline decoration-rule underline-offset-2">
                  2 Embed
                </Link>
                , then return here to simulate reads.
              </EmptyState>
            </div>
          ) : !channel ? (
            <div className="mt-3">
              <EmptyState title="No reads yet">
                Set a coverage and a substitution rate, then press Sequence it. Reads, bases read,
                substitutions and consensus errors appear here.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-3">
              <div className="grid grid-cols-2 gap-x-6 border-y border-rule py-2 sm:grid-cols-4">
                <FieldRow stacked label="reads" value={fmtInt(channel.reads)} />
                <FieldRow stacked label="bases read" value={fmtInt(channel.bases_read)} />
                <FieldRow
                  stacked
                  label="substitutions"
                  value={fmtInt(channel.substitutions)}
                />
                <FieldRow
                  stacked
                  label="consensus errors"
                  value={fmtInt(channel.consensus_errors)}
                />
              </div>

              <p className="num mt-3 text-[11px] leading-relaxed text-ink-muted">
                coverage {channel.coverage}× · substitution {fmtPct(channel.sub_rate, 2)} · seed{" "}
                {channel.seed} · {channel.applied ? "applied" : "not applied"}
              </p>

              <p className="mt-2 max-w-[62ch] text-[10.5px] leading-relaxed text-ink-muted">
                Reads are sampled from the stego sequence at the requested coverage. The consensus
                is the majority base per position; consensus errors count mismatches against the
                stego sequence.
              </p>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
