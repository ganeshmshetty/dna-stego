import { useEffect, useRef, useState } from "react"

interface SequenceTrackProps {
  label: string
  meta?: string
  seq?: string
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

function cellsFor(text: string, start: number) {
  return Array.from(text).map((base, offset) => {
    const index = start + offset
    return (
      <span
        key={`seq-${index}`}
        title={`position ${index + 1}: ${base}`}
        className={CELL}
      >
        <span className={baseClass(base)}>{base}</span>
      </span>
    )
  })
}

function useChunkSize() {
  const container = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState(50)

  useEffect(() => {
    const element = container.current
    if (!element) return
    const measure = () => {
      const available = element.clientWidth - 4
      const fit = Math.floor(available / 7.5)
      // Keep chunks in whole columns that fit the result column.
      const divisor = [50, 40, 25, 20].find((columns) => columns <= fit)
      setSize(divisor ?? 20)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { container, size }
}

export function SequenceTrack({ label, meta, seq }: SequenceTrackProps) {
  const { container, size } = useChunkSize()

  const chunks: Array<{ start: number; length: number }> = []
  const total = (seq ?? "").length
  for (let start = 0; start < total; start += size) {
    chunks.push({ start, length: Math.min(size, total - start) })
  }

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        {meta ? <span className="num text-[10.5px] text-ink-muted">{meta}</span> : null}
      </div>

      <div
        ref={container}
        className="pt-1.5 font-mono text-[11px] leading-[1.55] tracking-[0.01em]"
      >
        <div aria-hidden="true">
          {chunks.map(({ start, length }) => (
            <div key={start} className="pt-1.5 first:pt-0 whitespace-nowrap">
              {cellsFor((seq ?? "").slice(start, start + length), start)}
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">{`${label}: ${seq ?? ""}`}</p>
    </div>
  )
}
