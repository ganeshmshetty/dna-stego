import { useRef, useState } from "react"
import { Link } from "react-router-dom"

import { embedMessage, setMessageFile, setMessageText } from "@/lib/api"
import { describeError, type ErrorDescription } from "@/lib/errors"
import { fmtBytes, fmtFixed, fmtGenes, fmtInt } from "@/lib/format"
import { useSession } from "@/lib/session"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState, ErrorNote } from "@/components/common/EmptyState"
import { FieldRow } from "@/components/common/FieldRow"
import { Page } from "@/components/common/Page"
import { SequenceTrack } from "@/components/dna/SequenceTrack"

const DIFF_ROWS = 20

export function EmbedPage() {
  const { artifact, setArtifact } = useSession()
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorDescription | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const cover = artifact?.cover ?? null
  const message = artifact?.message ?? null
  const stego = artifact?.stego ?? null
  const canSubmit = Boolean(cover) && !busy && (file !== null || text.trim().length > 0)

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const withMessage = file ? await setMessageFile(file) : await setMessageText(text)
      setArtifact(withMessage)
      const next = await embedMessage()
      setArtifact(next)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      step="Step 2 / Embed"
      title="Hide the message by codon choice"
      description="Every amino acid has several codons. The message selects among them, so the translated protein never changes. The engine reports the codon diff and the capacity it used."
    >
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="min-w-0"
          aria-label="Embed a message"
        >
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <span className="label">Cover</span>
            <span className="num text-[10.5px] text-ink-muted">
              {cover
                ? `${fmtGenes(cover.gene_count)} · ${fmtInt(cover.nt)} nt`
                : "none"}
            </span>
          </div>

          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-4">
              <label htmlFor="message" className="label">
                Message
              </label>
              <span className="num text-[10.5px] text-ink-muted">
                {file ? "file selected" : `${text.length} chars`}
              </span>
            </div>
            <textarea
              id="message"
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setError(null)
              }}
              disabled={!cover || file !== null}
              spellCheck={false}
              placeholder={
                file
                  ? "A file will be used instead of typed text."
                  : "Type the message to hide…"
              }
              className="mt-1 h-[150px] w-full resize-y rounded-none border border-rule bg-paper p-2.5 font-mono text-[11px] leading-relaxed text-ink placeholder:text-ink-muted disabled:opacity-50"
            />
          </div>

          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="label">Or upload a file</span>
              <span className="num text-[10.5px] text-ink-muted">
                {file ? fmtBytes(file.size) : "any type"}
              </span>
            </div>
            <div className="mt-1.5 flex items-stretch border border-dashed border-rule">
              <button
                type="button"
                disabled={!cover}
                onClick={() => inputRef.current?.click()}
                className="min-w-0 flex-1 px-3 py-2 text-left disabled:opacity-50"
              >
                <span className="block truncate text-[12px] text-ink">
                  {file ? file.name : "Choose a file"}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-ink-muted">
                  {file ? "used instead of typed text" : "the bytes become the payload"}
                </span>
              </button>
              {file ? (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null)
                    if (inputRef.current) inputRef.current.value = ""
                  }}
                  className="border-l border-rule px-2.5 text-[10.5px] text-ink-muted transition-colors hover:text-ink"
                >
                  clear
                </button>
              ) : null}
            </div>
            <input
              ref={inputRef}
              type="file"
              tabIndex={-1}
              disabled={!cover}
              className="sr-only"
              aria-label="Upload a message file"
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null
                setFile(chosen)
                setError(null)
                event.target.value = ""
              }}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit}
            className="mt-5 h-9 w-full rounded-none text-[12.5px]"
          >
            {busy ? "Embedding…" : "Embed message"}
          </Button>

          {!cover ? (
            <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
              Set a cover on{" "}
              <Link to="/cover" className="text-ink underline decoration-rule underline-offset-2">
                1 Cover
              </Link>{" "}
              first.
            </p>
          ) : null}

          {message && !stego ? (
            <p className="num mt-2 text-[10px] leading-relaxed text-ink-muted">
              current message: {message.name} · {fmtInt(message.size)} B
            </p>
          ) : null}

          {error ? (
            <div className="mt-4">
              <ErrorNote message={error.message} hint={error.hint} />
            </div>
          ) : null}
        </form>

        <section aria-labelledby="embed-result" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <h2 id="embed-result" className="label">
              Result
            </h2>
            <span className="num text-[10.5px] text-ink-muted">
              {artifact ? `coder: ${artifact.coder}` : "no artifact"}
            </span>
          </div>

          {!cover ? (
            <div className="mt-3">
              <EmptyState title="Set a cover first">
                Choose a gene cassette on{" "}
                <Link to="/cover" className="text-ink underline decoration-rule underline-offset-2">
                  1 Cover
                </Link>
                , then return here to embed a message.
              </EmptyState>
            </div>
          ) : !stego ? (
            <div className="mt-3">
              <EmptyState
                title={message ? "Message set, not embedded" : "No message embedded"}
              >
                {message
                  ? `The engine has ${message.name} (${fmtInt(message.size)} B). Press Embed message to place it; if it does not fit, shorten it or choose a larger cover.`
                  : "Type or upload a message, then press Embed message. The protein check, capacity, changed nucleotides and codon diff appear here."}
              </EmptyState>
            </div>
          ) : (
            <div className="mt-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-y border-rule py-2.5">
                <Badge
                  variant="outline"
                  className={cn(
                    "h-6 gap-1.5 rounded-none border px-2 font-mono text-[10.5px] font-medium",
                    stego.protein_identical
                      ? "border-verified/40 bg-verified/10 text-verified"
                      : "border-damaged/40 bg-damaged/10 text-damaged",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5",
                      stego.protein_identical ? "bg-verified" : "bg-damaged",
                    )}
                  />
                  {stego.protein_identical ? "Protein unchanged" : "Protein changed"}
                </Badge>
                <p className="num text-[10.5px] text-ink-muted">
                  {message ? `${message.name} · ${fmtInt(message.size)} B` : "message missing"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-x-6 py-2 sm:grid-cols-4">
                <FieldRow
                  stacked
                  label="capacity used"
                  value={
                    message
                      ? `${fmtInt(message.size)} / ${fmtInt(stego.capacity_bytes)} B`
                      : `— / ${fmtInt(stego.capacity_bytes)} B`
                  }
                />
                <FieldRow
                  stacked
                  label="bits / codon"
                  value={fmtFixed(stego.bits_per_codon, 4)}
                />
                <FieldRow stacked label="nt changed" value={fmtInt(stego.changed_nt)} />
                <FieldRow stacked label="codons" value={fmtInt(stego.codon_count)} />
              </div>

              <div className="mt-3">
                <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
                  <h3 className="label">Codon changes</h3>
                  <span className="num text-[10.5px] text-ink-muted">
                    {fmtInt(stego.diff.length)} returned
                  </span>
                </div>

                {stego.diff.length === 0 ? (
                  <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
                    No codon changes were needed for this message.
                  </p>
                ) : (
                  <>
                    <Table className="mt-1 table-fixed text-[11.5px]">
                      <TableHeader>
                        <TableRow className="border-rule hover:bg-transparent">
                          <TableHead className="label h-8 w-[28%] px-2 text-left">
                            Codon index
                          </TableHead>
                          <TableHead className="label h-8 px-2 text-left">Cover</TableHead>
                          <TableHead className="label h-8 px-2 text-left">Stego</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stego.diff.slice(0, DIFF_ROWS).map((row) => (
                          <TableRow
                            key={row.codon_index}
                            className="border-rule hover:bg-transparent"
                          >
                            <TableCell className="num px-2 py-1.5 text-[11px] text-ink-muted">
                              {row.codon_index}
                            </TableCell>
                            <TableCell className="num px-2 py-1.5 text-[12px] tracking-[0.08em] text-ink-muted">
                              {row.cover}
                            </TableCell>
                            <TableCell className="num px-2 py-1.5 text-[12px] tracking-[0.08em] text-ink">
                              {row.stego}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
                      Changed codons only. Showing the first{" "}
                      {Math.min(DIFF_ROWS, stego.diff.length)} of{" "}
                      {fmtInt(stego.diff.length)} returned by the engine. Each row is a
                      synonymous substitution.
                    </p>
                  </>
                )}
              </div>

              <div className="mt-5 border-t border-rule pt-4">
                <div className="max-h-[260px] overflow-y-auto">
                  <SequenceTrack
                    label="Stego preview"
                    meta={`${fmtInt(stego.preview.length)} nt shown`}
                    seq={stego.preview}
                  />
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
                  Monospace window of <span className="num">stego.preview</span>, 5′ to 3′. The
                  full sequence is <span className="num">{fmtInt(stego.sequence.length)}</span>{" "}
                  nt.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
