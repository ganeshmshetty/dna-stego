import { useState } from "react"

import { setCover } from "@/lib/api"
import { describeError, type ErrorDescription } from "@/lib/errors"
import { fmtGenes, fmtInt } from "@/lib/format"
import { useSession } from "@/lib/session"
import type { Coder } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Page } from "@/components/common/Page"
import { EmptyState, ErrorNote } from "@/components/common/EmptyState"
import { FieldRow } from "@/components/common/FieldRow"
import { HelixPanel } from "@/components/dna/HelixPanel"

const CODERS: Array<{ value: Coder; label: string; description: string }> = [
  { value: "usage", label: "usage", description: "Match E. coli codon usage" },
  { value: "uniform", label: "uniform", description: "Equal bits per synonymous codon" },
]

export function CoverPage() {
  const { artifact, setArtifact } = useSession()
  const [geneCount, setGeneCount] = useState(artifact?.cover_selection.gene_count ?? 8)
  const [coder, setCoder] = useState<Coder>(artifact?.coder ?? "usage")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorDescription | null>(null)

  async function submit() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await setCover(geneCount, coder)
      setArtifact(next)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  const cover = artifact?.cover ?? null
  const genes = cover ? cover.name.split("+") : []

  return (
    <Page
      step="Step 1 / Cover"
      title="Choose a real E. coli cover"
      description="A coding sequence fixes the protein. Synonymous codons let us choose the letters. Pick how many real genes form the cassette and how those choices are coded."
    >
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="min-w-0"
          aria-label="Choose a cover"
        >
          <div>
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

          <fieldset className="mt-5">
            <legend className="label">Coder</legend>
            <div className="mt-1.5 grid grid-cols-2 border border-rule">
              {CODERS.map((option, index) => (
                <label
                  key={option.value}
                  className={cn(
                    "relative cursor-pointer px-3 py-2 transition-colors",
                    index > 0 && "border-l border-rule",
                    coder === option.value
                      ? "bg-ink text-paper"
                      : "bg-paper text-ink-muted hover:text-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="coder"
                    value={option.value}
                    checked={coder === option.value}
                    onChange={() => {
                      setCoder(option.value)
                      setError(null)
                    }}
                    className="peer sr-only"
                  />
                  <span className="block text-[12px] leading-none">{option.label}</span>
                  <span
                    className={cn(
                      "mt-1 block text-[10px] leading-snug",
                      coder === option.value ? "text-paper/70" : "text-ink-muted",
                    )}
                  >
                    {option.description}
                  </span>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <Button
            type="submit"
            size="lg"
            disabled={busy}
            className="mt-5 h-9 w-full rounded-none text-[12.5px]"
          >
            {busy ? "Selecting…" : "Use this cover"}
          </Button>

          <p className="mt-3 text-[10.5px] leading-relaxed text-ink-muted">
            Real E. coli K-12 coding sequences (NC_000913.3). A cassette of {fmtGenes(geneCount)}{" "}
            is used as the cover.
          </p>

          {error ? (
            <div className="mt-4">
              <ErrorNote message={error.message} hint={error.hint} />
            </div>
          ) : null}
        </form>

        <section aria-labelledby="cover-result" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <h2 id="cover-result" className="label">
              Result
            </h2>
            <span className="num text-[10.5px] text-ink-muted">
              {cover ? `${fmtGenes(cover.gene_count)} · ${artifact?.coder ?? "—"}` : "no cover"}
            </span>
          </div>

          {cover ? (
            <div className="mt-3">
              <div className="grid grid-cols-2 gap-x-6 border-y border-rule py-2 sm:grid-cols-4">
                <FieldRow stacked label="genes" value={fmtInt(cover.gene_count)} />
                <FieldRow stacked label="nt" value={fmtInt(cover.nt)} />
                <FieldRow stacked label="codons" value={fmtInt(cover.codons)} />
                <FieldRow stacked label="coder" value={artifact?.coder ?? "—"} />
              </div>

              <div className="mt-4">
                <p className="label">Gene cassette</p>
                <p className="num mt-1 text-[12px] leading-relaxed break-words text-ink">
                  {genes.join(" · ")}
                </p>
              </div>

              <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="label">Protein preview</p>
                    <span className="num text-[10.5px] text-ink-muted">
                      {fmtInt(cover.protein_preview.length)} aa shown
                    </span>
                  </div>
                  <pre className="mt-1 max-h-[220px] overflow-auto border border-rule bg-paper p-3 font-mono text-[10.5px] leading-relaxed tracking-[0.01em] break-all whitespace-pre-wrap text-ink">
                    {cover.protein_preview}
                  </pre>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
                    Translated from the cover cassette. Capacity in bytes is reported after the
                    message is embedded; the yield depends on the amino acids and the coder.
                  </p>
                </div>

                <HelixPanel sequence={cover.preview.slice(0, 24)} />
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <EmptyState title="No cover yet">
                Choose a gene count and a coder, then press Use this cover. The gene cassette,
                its nucleotide length and the translated protein appear here.
              </EmptyState>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
