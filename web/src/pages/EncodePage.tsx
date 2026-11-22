import { useRef, useState } from "react"

import { encodeFile } from "@/lib/api"
import { describeError, type ErrorDescription } from "@/lib/errors"
import { fmtBytes, fmtFixed, fmtInt } from "@/lib/format"
import { makeSampleFile } from "@/lib/mock"
import { useSession } from "@/lib/session"
import { RECIPIENTS, type Recipient } from "@/lib/types"
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
import { FieldRow } from "@/components/common/FieldRow"
import { ErrorNote, EmptyState } from "@/components/common/EmptyState"
import { SequenceTrack } from "@/components/dna/SequenceTrack"
import { HelixPanel } from "@/components/dna/HelixPanel"

export function EncodePage() {
  const { artifact, setArtifact } = useSession()
  const [file, setFile] = useState<File | null>(null)
  const [recipient, setRecipient] = useState<Recipient>(artifact?.recipient ?? "alice")
  const [showMarks, setShowMarks] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorDescription | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function chooseFile(next: File | null) {
    setFile(next)
    setError(null)
  }

  async function submit() {
    if (!file || busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await encodeFile(file, recipient)
      setArtifact(next)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      step="Step 1 / Encode"
      title="File to DNA strands"
      description="Split a file into 26-byte blocks, add a keyed mark, encode to 200 nt strands. The same file and recipient always produce the same strands."
    >
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="min-w-0"
          aria-label="Encode a file"
        >
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const dropped = event.dataTransfer.files[0]
              if (dropped) chooseFile(dropped)
            }}
            className={cn(
              "border border-dashed p-4 transition-colors",
              dragging ? "border-ink bg-muted" : "border-rule",
            )}
          >
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="block w-full text-left"
            >
              <span className="label">Source file</span>
              <span className="mt-1 block truncate text-[13px] text-ink">
                {file ? file.name : "Drop any file, or choose one"}
              </span>
              <span className="num mt-0.5 block text-[10.5px] text-ink-muted">
                {file ? fmtBytes(file.size) : "any type · up to 4,096 strands"}
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              tabIndex={-1}
              className="sr-only"
              aria-label="Choose a source file"
              onChange={(event) => {
                chooseFile(event.target.files?.[0] ?? null)
                event.target.value = ""
              }}
            />
          </div>

          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="label">Recipient</span>
              <span className="num text-[10.5px] text-ink-muted">key id: {recipient}</span>
            </div>
            <Select
              value={recipient}
              onValueChange={(value) => setRecipient(value as Recipient)}
            >
              <SelectTrigger
                aria-label="Recipient"
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

          <div className="mt-4 flex items-center gap-2">
            <Button
              type="submit"
              size="lg"
              disabled={!file || busy}
              className="h-9 flex-1 rounded-none text-[12.5px]"
            >
              {busy ? "Encoding…" : "Encode"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none border-rule px-3 text-[12px] font-normal"
              onClick={() => {
                chooseFile(makeSampleFile())
              }}
            >
              Load sample
            </Button>
          </div>

          <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
            Load sample generates a 1 KB text file in the browser. Nothing is uploaded.
          </p>

          {error ? (
            <div className="mt-4">
              <ErrorNote message={error.message} hint={error.hint} />
            </div>
          ) : null}
        </form>

        <section aria-labelledby="encode-result" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <h2 id="encode-result" className="label">
              Result
            </h2>
            <span className="num text-[10.5px] text-ink-muted">
              {artifact ? `key: ${artifact.recipient} · reserved mark` : "no artifact"}
            </span>
          </div>

          {artifact ? (
            <div className="mt-3">
              <div className="grid grid-cols-2 gap-x-6 border-y border-rule py-2 sm:grid-cols-3 lg:grid-cols-5">
                <FieldRow stacked label="strands" value={fmtInt(artifact.stats.strand_count)} />
                <FieldRow stacked label="nt total" value={fmtInt(artifact.stats.nt_total)} />
                <FieldRow
                  stacked
                  label="bits / nt"
                  value={fmtFixed(artifact.stats.bits_per_nt, 2)}
                />
                <FieldRow stacked label="GC mean" value={fmtFixed(artifact.stats.gc_mean, 3)} />
                <FieldRow
                  stacked
                  label="max homopolymer"
                  value={fmtInt(artifact.stats.max_homopolymer)}
                />
              </div>

              <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
                    <h3 className="label">First 3 strands</h3>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showMarks}
                      onClick={() => setShowMarks((value) => !value)}
                      className="inline-flex items-center gap-2 py-0.5"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "relative inline-block h-2.5 w-4 border",
                          showMarks ? "border-ink bg-ink" : "border-ink-muted bg-paper",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0 h-[8px] w-[6px] bg-paper",
                            showMarks ? "left-[8px]" : "left-0",
                          )}
                        />
                      </span>
                      <span className="label text-ink">show mark positions</span>
                      <span className="num text-[10px] text-ink-muted">
                        {showMarks ? "on" : "off"}
                      </span>
                    </button>
                  </div>
                  <div className="mt-3 space-y-4">
                    {artifact.strands.slice(0, 3).map((strand) => (
                      <SequenceTrack
                        key={strand.index}
                        label={`strand ${strand.index}`}
                        meta={`${strand.seq.length} nt · ${strand.payload_bytes} B · GC ${fmtFixed(strand.gc, 3)}`}
                        seq={strand.seq}
                        marks={strand.mark_positions}
                        showMarks={showMarks}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-[10.5px] leading-relaxed text-ink-muted">
                    Ticks mark the 16 nt interleaved field · 32 bits · 0.16 bits/nt.
                  </p>
                </div>

                <HelixPanel
                  sequence={artifact.strands[0]?.seq ?? ""}
                  markPositions={artifact.strands[0]?.mark_positions ?? []}
                />
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <EmptyState title="No strands yet">
                Choose a file and a recipient, then press Encode. The strand count, constraint
                health and first three strands appear here.
              </EmptyState>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
