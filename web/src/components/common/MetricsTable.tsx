import type { EvaluationRun } from "@/lib/types"
import { fmtFixed, fmtInt } from "@/lib/format"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function MetricsTable({ run }: { run: EvaluationRun }) {
  return (
    <figure className="min-w-0">
      <Table className="text-[11.5px]">
        <TableHeader>
          <TableRow className="border-rule hover:bg-transparent">
            <TableHead className="label h-8 px-2 text-left">Preset</TableHead>
            <TableHead className="label h-8 px-2 text-right">BER post-ECC</TableHead>
            <TableHead className="label h-8 px-2 text-right">bits/nt</TableHead>
            <TableHead className="label h-8 px-2 text-right">Steg. AUC</TableHead>
            <TableHead className="label h-8 px-2 text-right">TPR @1% FPR</TableHead>
            <TableHead className="label h-8 px-2 text-right">ID accuracy</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {run.metrics.map((row) => (
            <TableRow key={row.preset} className="border-rule hover:bg-transparent">
              <TableCell className="px-2 py-2 text-[12px] text-ink capitalize">{row.preset}</TableCell>
              <TableCell className="num px-2 py-2 text-right">
                {fmtFixed(row.ber_post_ecc, 4)}
              </TableCell>
              <TableCell className="num px-2 py-2 text-right">
                {fmtFixed(row.bits_per_nt, 3)}
              </TableCell>
              <TableCell className="num px-2 py-2 text-right">
                {fmtFixed(row.steganalysis_auc, 3)}
              </TableCell>
              <TableCell className="num px-2 py-2 text-right">
                {fmtFixed(row.verify_tpr_at_1pct_fpr, 3)}
              </TableCell>
              <TableCell className="num px-2 py-2 text-right">
                {fmtFixed(row.id_accuracy, 3)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <figcaption className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
        Saved run <span className="num">{run.run_id}</span> · seeds{" "}
        <span className="num">{run.seeds.map((seed) => fmtInt(seed)).join(", ")}</span>. Values
        are read from the saved run, not computed here.
      </figcaption>
    </figure>
  )
}
