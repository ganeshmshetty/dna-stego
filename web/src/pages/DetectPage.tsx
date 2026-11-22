import { useState } from "react"

import { runDetector } from "@/lib/api"
import { describeError, type ErrorDescription } from "@/lib/errors"
import { fmtFixed, fmtInt } from "@/lib/format"
import { useSession } from "@/lib/session"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorNote } from "@/components/common/EmptyState"
import { FieldRow } from "@/components/common/FieldRow"
import { MetricsTable } from "@/components/common/MetricsTable"
import { Page } from "@/components/common/Page"

const DETECT_GENE_COUNT = 120

function interpret(auc: number): {
  text: string
  tone: "ink" | "verified" | "damaged"
} {
  if (auc >= 0.95) return { text: "trivially detectable", tone: "damaged" }
  if (auc <= 0.55) return { text: "indistinguishable from natural DNA", tone: "verified" }
  return { text: "partially detectable", tone: "ink" }
}

export function DetectPage() {
  const { artifact, setArtifact } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorDescription | null>(null)

  async function submit() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await runDetector()
      setArtifact(next)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  const detection = artifact?.detection ?? null
  const verdict = detection ? interpret(detection.auc) : null

  return (
    <Page
      step="Step 5 / Detect"
      title="Run the steganalysis detector"
      description="Does the codon choice give the message away? A classifier is trained on natural and stego genes, then scored on genes it has never seen."
    >
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="min-w-0"
          aria-label="Run the steganalysis detector"
        >
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <span className="label">Detector</span>
            <span className="num text-[10.5px] text-ink-muted">fixed configuration</span>
          </div>

          <div className="mt-1">
            <FieldRow label="gene count" value={fmtInt(DETECT_GENE_COUNT)} />
            <FieldRow label="model" value="logistic regression" />
            <FieldRow label="features" value="61 codons + 256 4-mers" />
            <FieldRow
              label="coder"
              value={artifact ? artifact.coder : "session default"}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={busy}
            className="mt-4 h-9 w-full rounded-none text-[12.5px]"
          >
            {busy ? "Running…" : "Run steganalysis detector"}
          </Button>

          <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
            The gene count is fixed at {DETECT_GENE_COUNT}. The detector uses the coder selected in
            the current session.
          </p>

          {error ? (
            <div className="mt-4">
              <ErrorNote message={error.message} hint={error.hint} />
            </div>
          ) : null}
        </form>

        <section aria-labelledby="detect-result" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <h2 id="detect-result" className="label">
              Result
            </h2>
            <span className="num text-[10.5px] text-ink-muted">
              {detection ? `coder: ${detection.coder}` : "no detector run"}
            </span>
          </div>

          {!detection ? (
            <div className="mt-3">
              <EmptyState title="No detector run yet">
                Press Run steganalysis detector. It reports held-out AUC, TPR at 1% FPR and the
                natural / stego gene counts for this session.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-3">
              <div className="border border-rule">
                <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
                  <div>
                    <p className="label">AUC</p>
                    <p className="num mt-1 text-[44px] leading-none font-medium tracking-[-0.02em] text-ink">
                      {fmtFixed(detection.auc, 4)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "num text-[12.5px] leading-snug",
                        verdict?.tone === "damaged" && "text-damaged",
                        verdict?.tone === "verified" && "text-verified",
                        verdict?.tone === "ink" && "text-ink",
                      )}
                    >
                      {verdict?.text}
                    </p>
                    <p className="mt-1 text-[10.5px] leading-snug text-ink-muted">
                      AUC 0.5 is chance; 1.0 is perfect separation.
                    </p>
                  </div>
                </div>

                <div className="px-4 py-3">
                  <MetricsTable
                    rows={[
                      {
                        label: "TPR @ 1% FPR",
                        value: fmtFixed(detection.tpr_at_1pct, 4),
                      },
                      { label: "n natural", value: fmtInt(detection.n_natural) },
                      { label: "n stego", value: fmtInt(detection.n_stego) },
                      {
                        label: "n train / n test",
                        value: `${fmtInt(detection.n_train)} / ${fmtInt(detection.n_test)}`,
                      },
                      { label: "coder", value: detection.coder },
                    ]}
                    caption="logistic regression on 61 codon frequencies + 256 4-mer frequencies, trained on genes the test genes never overlap."
                  />
                </div>
              </div>

              <p className="mt-3 max-w-[62ch] text-[10.5px] leading-relaxed text-ink-muted">
                The split is by gene, so a high score means the classifier generalises to unseen
                sequences rather than memorising the training set.
              </p>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
