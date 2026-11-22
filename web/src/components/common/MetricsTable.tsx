import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface MetricRow {
  label: string
  value: ReactNode
  tone?: "ink" | "verified" | "damaged" | "muted"
}

const TONE_CLASS = {
  ink: "text-ink",
  verified: "text-verified",
  damaged: "text-damaged",
  muted: "text-ink-muted",
} as const

export function MetricsTable({
  rows,
  caption,
}: {
  rows: MetricRow[]
  caption?: ReactNode
}) {
  return (
    <figure className="min-w-0">
      <Table className="text-[11.5px]">
        <TableHeader>
          <TableRow className="border-rule hover:bg-transparent">
            <TableHead className="label h-8 px-2 text-left">Metric</TableHead>
            <TableHead className="label h-8 px-2 text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label} className="border-rule hover:bg-transparent">
              <TableCell className="px-2 py-2 text-[12px] text-ink-muted">
                {row.label}
              </TableCell>
              <TableCell
                className={cn(
                  "num px-2 py-2 text-right text-[12px]",
                  TONE_CLASS[row.tone ?? "ink"],
                )}
              >
                {row.value}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {caption ? (
        <figcaption className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}
