import { useRef, useState } from "react"

import { embedMessage, setCover, setMessageFile, setMessageText } from "@/lib/api"
import { describeError, type ErrorDescription } from "@/lib/errors"
import { fmtBytes, fmtFixed, fmtGenes, fmtInt } from "@/lib/format"
import { useSession } from "@/lib/session"
import type { Coder } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
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
import { FieldRow } from "@/components/common/FieldRow"
import { Page } from "@/components/common/Page"
import { PassphraseField } from "@/components/common/PassphraseField"
import { SequenceTrack } from "@/components/dna/SequenceTrack"

const DIFF_ROWS = 20

export function EmbedPage() {
  const { artifact, setArtifact } = useSession()
  const [geneCount, setGeneCount] = useState(artifact?.cover_selection.gene_count ?? 8)
  const [coder, setCoder] = useState<Coder>(artifact?.coder ?? "usage")
  const [passphrase, setPassphrase] = useState(artifact?.key_id ?? "alice")
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorDescription | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const cover = artifact?.cover ?? null
  const message = artifact?.message ?? null
  const stego = artifact?.stego ?? null
  const coverGenes = cover ? cover.name.split("+") : []
  const canSubmit =
    !busy && passphrase.trim().length > 0 && (file !== null || text.trim().length > 0)

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const withCover = await setCover(geneCount, coder, passphrase)
      setArtifact(withCover)
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
      step="Step 1 / Embed"
      title="Hide the message by codon choice"
      description="Choose a real E. coli cover, set the symmetric key, then hide the message in synonymous codons. The translated protein never changes."
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
            <h2 className="label">1 · Cover and key</h2>
            <span className="num text-[10.5px] text-ink-muted">
              {cover ? "saved" : "not saved"}
            </span>
          </div>

          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-4">
              <span id="gene-count-label" className="label">
                Gene count
              </span>
              <span className="num text-[11px] text-ink">{geneCount} / 40</span>
            </div>
            <Slider
              aria-labelledby="gene-count-label"
              className="mt-2.5"
              min={1}
              max={40}
              step={1}
              value={[geneCount]}
              onValueChange={(next) => {
                setGeneCount(next[0] ?? 1)
                setError(null)
              }}
            />
            <div className="num mt-1 flex justify-between text-[9.5px] text-ink-muted">
              <span>1</span>
              <span>40</span>
            </div>
          </div>

          <div className="mt-4">
            <CoderPicker
              value={coder}
              onChange={(next) => {
                setCoder(next)
                setError(null)
              }}
              name="embed-coder"
            />
          </div>

          <div className="mt-4">
            <PassphraseField
              id="embed-passphrase"
              value={passphrase}
              onChange={(next) => {
                setPassphrase(next)
                setError(null)
              }}
            />
          </div>

          {cover ? (
            <div className="mt-4 border-t border-rule pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="label">Applied cover</span>
                <span className="num text-[10px] text-ink-muted">
                  {fmtGenes(cover.gene_count)} · {fmtInt(cover.nt)} nt ·{" "}
                  {fmtInt(cover.codons)} codons
                </span>
              </div>
              <p className="num mt-1 text-[11px] leading-relaxed break-words text-ink">
                {coverGenes.join(" · ")}
              </p>
              <div className="mt-2">
                <p className="label">Protein preview</p>
                <pre className="mt-0.5 max-h-[64px] overflow-auto border border-rule bg-paper p-2 font-mono text-[9.5px] leading-relaxed break-all whitespace-pre-wrap text-ink">
                  {cover.protein_preview}
                </pre>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <h2 className="label">2 · Message</h2>
            <span className="num text-[10.5px] text-ink-muted">
              {file ? "file selected" : `${text.length} chars`}
            </span>
          </div>

          <div className="mt-3">
            <label htmlFor="message" className="label">
              Message
            </label>
            <textarea
              id="message"
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setError(null)
              }}
              disabled={file !== null}
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
                onClick={() => inputRef.current?.click()}
                className="min-w-0 flex-1 px-3 py-2 text-left"
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

          {!stego ? (
            <div className="mt-3">
              <EmptyState
                title={
                  cover
                    ? message
                      ? "Cover and key saved, message not embedded"
                      : "Cover and key saved"
                    : "No stego sequence yet"
                }
              >
                {cover
                  ? message
                    ? `The engine has ${message.name} (${fmtInt(message.size)} B) but no stego sequence. Press Embed message to place it; if it does not fit, shorten it or choose a larger cover.`
                    : "Add a message and press Embed message. Capacity, changed nucleotides and the codon diff appear here."
                  : "Set the cover and key, type or upload a message, then press Embed message. The cover summary appears once saved and the stego result here."}
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
