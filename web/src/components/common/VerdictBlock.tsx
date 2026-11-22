import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface VerdictRow {
  label: string
  value: ReactNode
  tone?: "ink" | "verified" | "damaged" | "muted"
}

interface VerdictBlockProps {
  ok: boolean
  verdict: string
  aside?: string
  rows?: VerdictRow[]
  children?: ReactNode
  note?: ReactNode
  className?: string
}

const TONE_CLASS = {
  ink: "text-ink",
  verified: "text-verified",
  damaged: "text-damaged",
  muted: "text-ink-muted",
} as const

export function VerdictBlock({
  ok,
  verdict,
  aside,
  rows,
  children,
  note,
  className,
}: VerdictBlockProps) {
  return (
    <div role="status" aria-live="polite" className={cn("border border-rule", className)}>
      <div className="flex items-baseline justify-between gap-4 px-4 pt-3 pb-2">
        <span className="label">Verdict</span>
        {aside ? <span className="label">{aside}</span> : null}
      </div>
      <div className="flex items-baseline gap-2.5 px-4 pb-4">
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-2 translate-y-[-2px]",
            ok ? "bg-verified" : "bg-damaged",
          )}
        />
        <span
          className={cn(
            "text-[26px] leading-none font-medium tracking-[-0.01em]",
            ok ? "text-verified" : "text-damaged",
          )}
        >
          {verdict}
        </span>
      </div>
      {children ? (
        <div className="border-t border-rule">{children}</div>
      ) : rows && rows.length > 0 ? (
        <dl className="grid grid-cols-1 border-t border-rule sm:grid-cols-3">
          {rows.map((row, index) => (
            <div
              key={row.label}
              className={cn(
                "border-b border-rule px-4 py-3 last:border-b-0 sm:border-b-0",
                index < rows.length - 1 && "sm:border-r",
              )}
            >
              <dt className="label">{row.label}</dt>
              <dd
                className={cn(
                  "num mt-1 text-[13px] leading-snug break-words",
                  TONE_CLASS[row.tone ?? "ink"],
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {note ? (
        <p className="border-t border-rule px-4 py-2 text-[11px] leading-relaxed text-ink-muted">
          {note}
        </p>
      ) : null}
    </div>
  )
}
