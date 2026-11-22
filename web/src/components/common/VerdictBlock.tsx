import { cn } from "@/lib/utils"
import { fmtFixed, fmtP } from "@/lib/format"
import type { ReactNode } from "react"

interface VerdictBlockProps {
  detected: boolean
  recipient: string | null
  pValue: number
  score: number
  nullMean?: number
  note?: ReactNode
  className?: string
}

export function VerdictBlock({
  detected,
  recipient,
  pValue,
  score,
  nullMean = 0.5,
  note,
  className,
}: VerdictBlockProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("border border-rule", className)}
    >
      <div className="flex items-baseline justify-between gap-4 px-4 pt-3 pb-2">
        <span className="label">Verdict</span>
        <span className="label">alpha 0.01</span>
      </div>
      <div className="flex items-baseline gap-2.5 px-4 pb-4">
        <span
          aria-hidden="true"
          className={cn("inline-block size-2 translate-y-[-2px]", detected ? "bg-verified" : "bg-damaged")}
        />
        <span
          className={cn(
            "text-[28px] leading-none font-medium tracking-[-0.015em]",
            detected ? "text-verified" : "text-damaged",
          )}
        >
          {detected ? "Detected" : "Not detected"}
        </span>
        <span className="num text-[12px] text-ink-muted">
          {detected ? "mark present" : "mark absent under this key"}
        </span>
      </div>
      <dl className="grid grid-cols-1 border-t border-rule sm:grid-cols-3">
        <div className="border-b border-rule px-4 py-3 sm:border-r sm:border-b-0">
          <dt className="label">Recipient</dt>
          <dd className="num mt-1 text-[13px] text-ink">{recipient ?? "none"}</dd>
        </div>
        <div className="border-b border-rule px-4 py-3 sm:border-r sm:border-b-0">
          <dt className="label">p-value</dt>
          <dd className="num mt-1 text-[13px] text-ink">{fmtP(pValue)}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="label">Score vs null</dt>
          <dd className="num mt-1 text-[13px] text-ink">
            {fmtFixed(score, 2)} <span className="text-ink-muted">/ {fmtFixed(nullMean, 2)}</span>
          </dd>
        </div>
      </dl>
      {note ? (
        <p className="border-t border-rule px-4 py-2 text-[11px] leading-relaxed text-ink-muted">
          {note}
        </p>
      ) : null}
    </div>
  )
}
