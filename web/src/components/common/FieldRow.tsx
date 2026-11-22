import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface FieldRowProps {
  label: string
  value: ReactNode
  stacked?: boolean
}

export function FieldRow({ label, value, stacked = false }: FieldRowProps) {
  return (
    <div
      className={cn(
        stacked
          ? "flex flex-col gap-1 py-1.5"
          : "flex items-baseline justify-between gap-4 border-b border-rule py-2 last:border-b-0",
      )}
    >
      <span className="label shrink-0">{label}</span>
      <span
        className={cn(
          "num text-[12.5px] leading-tight text-ink",
          !stacked && "text-right",
        )}
      >
        {value}
      </span>
    </div>
  )
}
