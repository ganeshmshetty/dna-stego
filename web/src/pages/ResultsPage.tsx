import { useEffect, useState } from "react"
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { getResults } from "@/lib/api"
import { describeError, type ErrorDescription } from "@/lib/errors"
import { fmtFixed } from "@/lib/format"
import type { EvaluationRun, ResultsResponse, SeriesPoint } from "@/lib/types"
import { Page } from "@/components/common/Page"
import { EmptyState, ErrorNote } from "@/components/common/EmptyState"
import { MetricsTable } from "@/components/common/MetricsTable"
import { Button } from "@/components/ui/button"

const TOOLTIP_STYLE = {
  border: "1px solid var(--rule)",
  borderRadius: 0,
  boxShadow: "none",
  background: "var(--paper)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  padding: "4px 6px",
}

function LineFigure({
  title,
  caption,
  data,
  xLabel,
  yDomain,
  yTicks,
  referenceY,
  xSuffix = "%",
}: {
  title: string
  caption: string
  data: SeriesPoint[]
  xLabel: string
  yDomain: [number, number]
  yTicks: number[]
  referenceY?: number
  xSuffix?: string
}) {
  return (
    <figure className="min-w-0">
      <figcaption className="border-b border-rule pb-2">
        <span className="text-[12px] leading-snug font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-muted">
          {caption}
        </span>
      </figcaption>
      <div
        className="mt-3 h-[168px] w-full"
        role="img"
        aria-label={`${title}. ${caption}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 2, left: -8 }}>
            <XAxis
              dataKey="x"
              tickFormatter={(value: number) => `${value}${xSuffix}`}
              stroke="var(--rule)"
              tickLine={false}
              axisLine={{ stroke: "var(--rule)" }}
              tick={{
                fill: "var(--ink-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
              }}
            />
            <YAxis
              domain={yDomain}
              ticks={yTicks}
              tickFormatter={(value: number) => value.toFixed(2)}
              stroke="var(--rule)"
              tickLine={false}
              axisLine={false}
              width={40}
              tick={{
                fill: "var(--ink-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
              }}
            />
            {referenceY !== undefined ? (
              <ReferenceLine
                y={referenceY}
                stroke="var(--ink-muted)"
                strokeDasharray="2 3"
                label={{
                  value: String(referenceY),
                  position: "insideTopRight",
                  fill: "var(--ink-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                }}
              />
            ) : null}
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "var(--ink-muted)" }}
              itemStyle={{ color: "var(--ink)" }}
              labelFormatter={(value) => `${String(value)}${xSuffix} ${xLabel}`}
            />
            <Line
              type="linear"
              dataKey="y"
              name={title}
              stroke="var(--ink)"
              strokeWidth={1.25}
              dot={{ r: 2, fill: "var(--paper)", stroke: "var(--ink)", strokeWidth: 1 }}
              activeDot={{ r: 3, fill: "var(--ink)", stroke: "none" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{xLabel}</th>
            <th scope="col">value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.x}>
              <td>{point.x}</td>
              <td>{fmtFixed(point.y, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function AvailableResults({ run }: { run: EvaluationRun }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="metrics-heading">
        <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
          <h2 id="metrics-heading" className="label">
            Metrics by noise preset
          </h2>
          <span className="num text-[10.5px] text-ink-muted">
            run {run.run_id} · {run.created_at.slice(0, 10)}
          </span>
        </div>
        <div className="mt-3">
          <MetricsTable run={run} />
        </div>
      </section>

      <section aria-labelledby="charts-heading">
        <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
          <h2 id="charts-heading" className="label">
            Sweeps
          </h2>
          <span className="num text-[10.5px] text-ink-muted">{run.seeds.length} seeds</span>
        </div>
        <div className="mt-4 grid gap-8 md:grid-cols-2">
          <LineFigure
            title="Exact file recovery"
            caption="Share of runs returning the original bytes as substitution noise rises. Hover a point for its value."
            data={run.recovery_vs_noise}
            xLabel="substitution"
            yDomain={[0, 1]}
            yTicks={[0, 0.25, 0.5, 0.75, 1]}
          />
          <LineFigure
            title="Steganalysis AUC"
            caption="Attacker AUC on natural DNA vs marked strands; 0.5 is indistinguishable. Hover a point for its value."
            data={run.steganalysis_vs_mark_strength}
            xLabel="mark strength"
            xSuffix=""
            yDomain={[0.4, 1]}
            yTicks={[0.5, 0.6, 0.7, 0.8, 0.9, 1]}
            referenceY={0.5}
          />
        </div>
      </section>
    </div>
  )
}

export function ResultsPage() {
  const [results, setResults] = useState<ResultsResponse | null>(null)
  const [error, setError] = useState<ErrorDescription | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let mounted = true
    getResults()
      .then((next) => {
        if (mounted) setResults(next)
      })
      .catch((caught) => {
        if (mounted) setError(describeError(caught))
      })
    return () => {
      mounted = false
    }
  }, [reloadKey])

  function reload() {
    setResults(null)
    setError(null)
    setReloadKey((key) => key + 1)
  }

  return (
    <Page
      step="Step 5 / Results"
      title="What the evaluation measured"
      description="Read from a saved sweep. Rows are noise presets; columns are the metrics defined in the protocol. Nothing on this page is estimated in the browser."
    >
      <section aria-labelledby="results-heading">
        <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
          <h2 id="results-heading" className="label">
            Evaluation run
          </h2>
          <div className="flex items-center gap-3">
            <span className="num text-[10.5px] text-ink-muted">
              {results === null ? "reading…" : results.available ? "saved run" : "no saved run"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reload}
              className="h-6 rounded-none border-rule px-2 text-[10.5px] font-normal"
            >
              Reload
            </Button>
          </div>
        </div>

        <div className="mt-3">
          {error ? (
            <ErrorNote message={error.message} hint={error.hint} />
          ) : results === null ? (
            <div className="min-h-[220px] border border-rule px-5 py-8">
              <p className="num text-[11px] text-ink-muted">Reading saved evaluation…</p>
            </div>
          ) : results.available ? (
            <AvailableResults run={results} />
          ) : (
            <EmptyState title="No evaluation run found">
              <p>{results.message}</p>
              <p className="mt-3">Produce the table with the reproducible sweep:</p>
              <code className="mt-2 block overflow-x-auto border border-rule bg-paper px-3 py-2 font-mono text-[11px] text-ink">
                {results.command}
              </code>
              <p className="mt-3">
                The page reads <span className="num">data/eval/results.json</span>. It never
                estimates or fabricates numbers.
              </p>
            </EmptyState>
          )}

          <div className="mt-5 border-t border-rule pt-3">
            <p className="label">Mark cost · fixed geometry</p>
            <p className="mt-1 max-w-[760px] text-[11px] leading-relaxed text-ink-muted">
              v0 reserves 32 bits per 200 nt strand: 0.16 bits/nt, or 13% of unmarked payload
              capacity (1.20 → 1.04 bits/nt). This is a constant, not a measured result. Recovery
              and detectability are reported only when a sweep exists.
            </p>
          </div>
        </div>
      </section>
    </Page>
  )
}
