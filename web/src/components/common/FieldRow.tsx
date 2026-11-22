import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface FieldRowProps {
  label: string
  value: ReactNode
  stale?: boolean
  stacked?: boolean
  className?: string
}

export function FieldRow({
  label,
  value,
  stale = false,
  stacked = false,
  className,
}: FieldRowProps) {
  return (
    <div
      className={cn(
        stacked
          ? "flex flex-col gap-1 py-1.5"
          : "flex items-baseline justify-between gap-4 border-b border-rule py-2 last:border-b-0",
        className,
      )}
    >
      <span className="label shrink-0">{label}</span>
      <span
        className={cn(
          "num text-[12.5px] leading-tight text-ink",
          !stacked && "text-right",
          stale && "text-damaged",
        )}
      >
        {value}
        {stale ? " · stale" : null}
      </span>
    </div>
  )
}
