import { useState } from "react"
import { Link } from "react-router-dom"

import { recoverMessage } from "@/lib/api"
import { describeError, type ErrorDescription } from "@/lib/errors"
import { fmtInt, fmtPct } from "@/lib/format"
import { useSession } from "@/lib/session"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorNote } from "@/components/common/EmptyState"
import { FieldRow } from "@/components/common/FieldRow"
import { Page } from "@/components/common/Page"
import { VerdictBlock } from "@/components/common/VerdictBlock"

export function RecoverPage() {
  const { artifact, setArtifact } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorDescription | null>(null)

  const stego = artifact?.stego ?? null
  const channel = artifact?.channel ?? null
  const message = artifact?.message ?? null
  const recovery = artifact?.recovery ?? null

  async function submit() {
    if (busy || !stego) return
    setBusy(true)
    setError(null)
    try {
      const next = await recoverMessage()
      setArtifact(next)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      step="Step 3 / Recover"
      title="Recover the hidden message"
      description="Extract the payload from the consensus sequence, check the CRC, then compare the recovered SHA-256 with the message that was embedded."
    >
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="min-w-0"
          aria-label="Recover the message"
        >
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <span className="label">Input</span>
            <span className="num text-[10.5px] text-ink-muted">
              {stego
                ? channel
                  ? "damaged consensus"
                  : "clean stego sequence"
                : "no stego sequence"}
            </span>
          </div>

          {stego ? (
            <div className="mt-1">
              <FieldRow label="message" value={message?.name ?? "—"} />
              <FieldRow
                label="payload"
                value={message ? `${fmtInt(message.size)} B` : "—"}
              />
              <FieldRow label="stego" value={`${fmtInt(stego.sequence.length)} nt`} />
              <FieldRow
                label="input"
                value={
                  channel
                    ? `${fmtInt(channel.coverage)}× · ${fmtPct(channel.sub_rate, 2)} sub`
                    : "no channel applied"
                }
              />
            </div>
          ) : (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
              Embed a message on{" "}
              <Link to="/embed" className="text-ink underline decoration-rule underline-offset-2">
                1 Embed
              </Link>{" "}
              first.
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={busy || !stego}
            className="mt-4 h-9 w-full rounded-none text-[12.5px]"
          >
            {busy ? "Recovering…" : "Recover message"}
          </Button>

          <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
            {!stego
              ? "Recovery needs a stego sequence; embed a message on 1 Embed first."
              : channel
                ? "Recovery reads the consensus written by Step 2. Re-run sequencing first if the channel parameters change."
                : "No channel is applied, so recovery reads the stego sequence directly. Damage it on 2 Damage to exercise the reads."}
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
            <span className="num text-[10.5px] text-ink-muted">crc · sha-256 · bytes</span>
          </div>

          {!stego ? (
            <div className="mt-3">
              <EmptyState title="Embed a message first">
                Recovery needs a stego sequence. Embed a message on{" "}
                <Link to="/embed" className="text-ink underline decoration-rule underline-offset-2">
                  1 Embed
                </Link>
                , then return here to extract it.
              </EmptyState>
            </div>
          ) : !recovery ? (
            <div className="mt-3">
              <EmptyState title="No recovery yet">
                Press Recover message. The verdict, CRC check, SHA-256 comparison, byte count and
                decoded preview appear here.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-3">
              <VerdictBlock
                ok={recovery.ok}
                verdict={recovery.ok ? "RECOVERED" : "FAILED"}
                aside="message integrity"
                rows={[
                  {
                    label: "CRC",
                    value: recovery.crc_ok ? "ok" : "failed",
                    tone: recovery.crc_ok ? "verified" : "damaged",
                  },
                  {
                    label: "SHA-256",
                    value: recovery.matches_original
                      ? "matches original"
                      : "does not match",
                    tone: recovery.matches_original ? "verified" : "damaged",
                  },
                  {
                    label: "Bytes",
                    value:
                      recovery.length === null ? "—" : `${fmtInt(recovery.length)} B`,
                  },
                ]}
                note="The CRC and hash are checked after extraction. The preview is decoded from the recovered bytes."
              />

              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="label">session key</span>
                <span className="num text-[10.5px] leading-relaxed text-ink">
                  {artifact?.key_fingerprint ?? "—"}
                </span>
              </p>

              {recovery.error ? (
                <p
                  role="alert"
                  className="mt-3 border-l border-damaged pl-3 text-[12px] leading-snug text-damaged"
                >
                  {recovery.error}
                </p>
              ) : null}

              <div className="mt-4 border border-rule px-4 py-3">
                <p className="label">SHA-256</p>
                <p
                  className={cn(
                    "num mt-1 text-[10.5px] leading-relaxed break-all",
                    recovery.matches_original ? "text-ink" : "text-damaged",
                  )}
                >
                  {recovery.sha256 ?? "—"}
                </p>
                {message ? (
                  <p className="num mt-1 text-[10px] leading-relaxed break-all text-ink-muted">
                    original {message.sha256}
                  </p>
                ) : null}
              </div>

              <div className="mt-4">
                <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
                  <h3 className="label">Message preview</h3>
                  <span className="num text-[10.5px] text-ink-muted">
                    {fmtInt(recovery.bits_read)} bits read
                  </span>
                </div>
                <pre className="mt-2 min-h-[80px] border border-rule bg-paper p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-ink">
                  {recovery.preview || "No bytes returned."}
                </pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
