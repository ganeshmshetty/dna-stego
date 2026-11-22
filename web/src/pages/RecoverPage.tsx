import { useState } from "react"
import { Link } from "react-router-dom"

import { recover } from "@/lib/api"
import { describeError, type ErrorDescription } from "@/lib/errors"
import { fmtBytes, fmtInt, fmtPct, fmtRate } from "@/lib/format"
import { useSession } from "@/lib/session"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Page } from "@/components/common/Page"
import { EmptyState, ErrorNote } from "@/components/common/EmptyState"
import { FieldRow } from "@/components/common/FieldRow"

function ShareBar({
  label,
  value,
  total,
  tone,
}: {
  label: string
  value: number
  total: number
  tone: "muted" | "ink" | "verified" | "damaged"
}) {
  const share = total === 0 ? 0 : Math.min(1, value / total)
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-3">
      <span className="label">{label}</span>
      <span aria-hidden="true" className="block h-2 border border-rule bg-paper">
        <span
          className={cn(
            "block h-full",
            tone === "muted" && "bg-ink-muted/40",
            tone === "ink" && "bg-ink",
            tone === "verified" && "bg-verified",
            tone === "damaged" && "bg-damaged",
          )}
          style={{ width: `${share * 100}%` }}
        />
      </span>
      <span className="num w-[92px] text-right text-[11px] text-ink">{fmtInt(value)}</span>
    </div>
  )
}

export function RecoverPage() {
  const { artifact, setArtifact, isStale, stale } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorDescription | null>(null)

  async function submit() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await recover()
      setArtifact(
        next,
        [...stale].filter((field) => field !== "recovery"),
      )
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  const recovery = artifact?.recovery
  const staleRecovery = isStale("recovery")
  const match = Boolean(
    recovery &&
      recovery.recovered_sha256 &&
      recovery.recovered_sha256 === artifact?.file.sha256,
  )

  return (
    <Page
      step="Step 3 / Recover"
      title="Decode the archive"
      description="Unscramble, Reed–Solomon decode and verify the CRC for every surviving strand. The recovered bytes are compared to the original by SHA-256."
    >
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="min-w-0"
          aria-label="Decode the archive"
        >
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <span className="label">Input</span>
            <span className="num text-[10.5px] text-ink-muted">
              {artifact ? fmtBytes(artifact.file.size) : "no file"}
            </span>
          </div>
          {artifact ? (
            <div className="mt-1">
              <FieldRow label="file" value={artifact.file.name} />
              <FieldRow label="key" value={artifact.recipient} />
              <FieldRow
                label="channel"
                value={
                  artifact.channel.applied
                    ? `${fmtPct(artifact.channel.sub, 2)} sub · ${fmtPct(artifact.channel.dropout, 0)} drop`
                    : "clean"
                }
              />
              <FieldRow
                label="strands in"
                value={fmtInt(
                  artifact.noisy_strands?.length ?? artifact.strands.length,
                )}
              />
            </div>
          ) : (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
              Encode a file on{" "}
              <Link to="/encode" className="text-ink underline decoration-rule underline-offset-2">
                1 Encode
              </Link>{" "}
              first.
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={busy || !artifact}
            className="mt-4 h-9 w-full rounded-none text-[12.5px]"
          >
            {busy ? "Decoding…" : "Decode"}
          </Button>

          <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
            {artifact?.channel.applied
              ? "The active channel is damaged. Decode reconstructs from the surviving strands and reports the residual error rate."
              : "A clean channel decodes the artifact as encoded. Apply noise on 2 Channel to exercise erasures."}
          </p>

          {error ? (
            <div className="mt-4">
              <ErrorNote message={error.message} hint={error.hint} />
            </div>
          ) : null}
        </form>

        <section aria-labelledby="recover-result" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <h2 id="recover-result" className="label">
              Result
            </h2>
            <span className="num text-[10.5px] text-ink-muted">original · decoded</span>
          </div>

          {!artifact ? (
            <div className="mt-3">
              <EmptyState title="Nothing to decode">
                Encode a file first. The result reports byte recovery, the two SHA-256 hashes and
                the pre-/post-ECC BER.
              </EmptyState>
            </div>
          ) : staleRecovery ? (
            <div className="mt-3">
              <EmptyState title="Recovery is not current">
                Press Decode to compute recovery for the current channel. Any previously computed
                figures are marked stale and are not shown.
              </EmptyState>
            </div>
          ) : !recovery ? (
            <div className="mt-3">
              <EmptyState title="No decode yet">
                Press Decode. With no channel applied this returns the clean-channel result.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-3 border border-rule">
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
                <div className="flex items-baseline gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-block size-2 translate-y-[-2px]",
                      recovery.ok ? "bg-verified" : "bg-damaged",
                    )}
                  />
                  <span
                    className={cn(
                      "text-[24px] leading-none font-medium tracking-[-0.015em]",
                      recovery.ok ? "text-verified" : "text-damaged",
                    )}
                  >
                    {recovery.ok ? "Recovered" : "Partial recovery"}
                  </span>
                </div>
                <span className="num text-[11px] text-ink-muted">
                  {fmtInt(recovery.bytes_recovered)} / {fmtInt(artifact.file.size)} B
                </span>
              </div>

              <div className="border-b border-rule px-4 py-3">
                <p className="label">SHA-256</p>
                <div className="mt-2 space-y-2">
                  <div className="grid gap-1 sm:grid-cols-[76px_minmax(0,1fr)] sm:gap-3">
                    <span className="label pt-px">original</span>
                    <span className="num text-[10.5px] leading-relaxed break-all text-ink">
                      {artifact.file.sha256}
                    </span>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-[76px_minmax(0,1fr)] sm:gap-3">
                    <span className="label pt-px">recovered</span>
                    <span
                      className={cn(
                        "num text-[10.5px] leading-relaxed break-all",
                        match ? "text-ink" : "text-damaged",
                      )}
                    >
                      {recovery.recovered_sha256 ?? "—"}
                    </span>
                  </div>
                  <p className="pl-0 sm:pl-[88px]">
                    <span
                      className={cn(
                        "label",
                        match ? "text-verified" : "text-damaged",
                      )}
                    >
                      {match ? "hashes match" : "hashes differ"}
                    </span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 border-b border-rule">
                <div className="border-r border-rule px-4 py-3">
                  <FieldRow
                    label="BER pre-ECC"
                    value={fmtRate(recovery.ber_pre_ecc)}
                    className="border-0 py-0"
                  />
                </div>
                <div className="px-4 py-3">
                  <FieldRow
                    label="BER post-ECC"
                    value={fmtRate(recovery.ber_post_ecc)}
                    className="border-0 py-0"
                  />
                </div>
              </div>

              <div className="px-4 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="label">Strands in → surviving → bytes</p>
                  <p className="num text-[10.5px] text-ink-muted">
                    {fmtInt(recovery.strands_in)} · {fmtInt(recovery.strands_out)} ·{" "}
                    {fmtInt(recovery.bytes_recovered)}
                  </p>
                </div>
                <div className="mt-3 space-y-2">
                  <ShareBar
                    label="strands in"
                    value={recovery.strands_in}
                    total={recovery.strands_in}
                    tone="muted"
                  />
                  <ShareBar
                    label="surviving"
                    value={recovery.strands_out}
                    total={recovery.strands_in}
                    tone="ink"
                  />
                  <ShareBar
                    label="bytes back"
                    value={recovery.bytes_recovered}
                    total={artifact.file.size}
                    tone={recovery.ok ? "verified" : "damaged"}
                  />
                </div>
                <p className="mt-3 text-[10.5px] leading-relaxed text-ink-muted">
                  Each row is a share of its own total; the three bars are not additive. Erasures
                  are counted as strand loss before reconstruction.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
