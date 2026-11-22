import { useEffect, useRef, useState } from "react"

import type { Alignment } from "@/lib/align"
import { cn } from "@/lib/utils"

interface SequenceTrackProps {
  label: string
  meta?: string
  seq?: string
  marks?: number[]
  showMarks?: boolean
  diff?: Alignment
  className?: string
}

const CELL = "relative inline-block w-[0.64em] text-center align-baseline"

function baseClass(base: string): string {
  switch (base) {
    case "A":
      return "base-A"
    case "T":
      return "base-T"
    case "G":
      return "base-G"
    case "C":
      return "base-C"
    default:
      return "text-ink"
  }
}

function cellsFor(
  text: string,
  changed: boolean[],
  markPositions: Set<number>,
  side: string,
  start: number,
) {
  return Array.from(text).map((base, offset) => {
    const index = start + offset
    const gap = base === "-"
    const edited = changed[offset] ?? false
    const marked = markPositions.has(index)
    return (
      <span
        key={`${side}-${index}`}
        title={
          gap
            ? `gap at ${index + 1}`
            : `position ${index + 1}: ${base}${marked ? " · mark" : ""}`
        }
        className={cn(
          CELL,
          edited && !gap && "diff-changed",
          gap && "diff-gap select-none",
        )}
      >
        {marked ? (
          <span
            aria-hidden="true"
            className="absolute -top-[4px] left-1/2 z-10 h-[3px] w-px -translate-x-1/2 bg-verified"
          />
        ) : null}
        {gap ? (
          "\u00b7"
        ) : (
          <span className={cn(baseClass(base), edited && "text-damaged")}>{base}</span>
        )}
      </span>
    )
  })
}

function useChunkSize(hasLabels: boolean) {
  const container = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState(50)

  useEffect(() => {
    const element = container.current
    if (!element) return
    const measure = () => {
      const available = element.clientWidth - (hasLabels ? 48 : 0) - 4
      const fit = Math.floor(available / 7.5)
      if (hasLabels) {
        setSize(Math.max(20, Math.min(96, fit)))
      } else {
        // Keep 200 nt strands in whole rows: 50, 40, 25 or 20 columns.
        const divisor = [50, 40, 25, 20].find((columns) => columns <= fit)
        setSize(divisor ?? 20)
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasLabels])

  return { container, size }
}

export function SequenceTrack({
  label,
  meta,
  seq,
  marks,
  showMarks = false,
  diff,
  className,
}: SequenceTrackProps) {
  const markSet = new Set(showMarks ? (marks ?? []) : [])
  const { container, size } = useChunkSize(Boolean(diff))

  const chunks: Array<{ start: number; length: number }> = []
  const total = diff ? diff.before.length : (seq ?? "").length
  for (let start = 0; start < total; start += size) {
    chunks.push({ start, length: Math.min(size, total - start) })
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        {meta ? <span className="num text-[10.5px] text-ink-muted">{meta}</span> : null}
      </div>

      <div
        ref={container}
        className="pt-1.5 font-mono text-[11px] leading-[1.55] tracking-[0.01em]"
      >
        {diff ? (
          <div aria-hidden="true">
            {chunks.map(({ start, length }) => (
              <div key={start} className="pt-1.5 first:pt-0">
                <div className="flex gap-2">
                  <span className="w-[40px] shrink-0 pt-px text-[9.5px] tracking-[0.04em] text-ink-muted uppercase">
                    before
                  </span>
                  <span className="min-w-0 flex-1 whitespace-nowrap">
                    {cellsFor(
                      diff.before.slice(start, start + length),
                      diff.changed.slice(start, start + length),
                      markSet,
                      `before-${start}`,
                      start,
                    )}
                  </span>
                </div>
                <div className="mt-1 flex gap-2">
                  <span className="w-[40px] shrink-0 pt-px text-[9.5px] tracking-[0.04em] text-ink-muted uppercase">
                    after
                  </span>
                  <span className="min-w-0 flex-1 whitespace-nowrap">
                    {cellsFor(
                      diff.after.slice(start, start + length),
                      diff.changed.slice(start, start + length),
                      markSet,
                      `after-${start}`,
                      start,
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div aria-hidden="true">
            {chunks.map(({ start, length }) => (
              <div key={start} className="pt-1.5 first:pt-0 whitespace-nowrap">
                {cellsFor(
                  (seq ?? "").slice(start, start + length),
                  [],
                  markSet,
                  `seq-${start}`,
                  start,
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="sr-only">
        {diff
          ? `${label}: before ${diff.before.replace(/-/g, "")}; after ${diff.after.replace(/-/g, "")}.`
          : `${label}: ${seq ?? ""}`}
      </p>
    </div>
  )
}
