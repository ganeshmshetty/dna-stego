import { useSession } from "@/lib/session"

export function StaleNotice() {
  const { artifact } = useSession()

  if (!artifact || artifact.stale.length === 0) return null

  return (
    <div className="border-b border-rule bg-muted">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-1.5 sm:px-6">
        <span className="label text-damaged">Stale</span>
        <span className="num text-[10.5px] text-ink">{artifact.stale.join(" · ")}</span>
        <span className="text-[10.5px] text-ink-muted">
          a later step must be re-run
        </span>
      </div>
    </div>
  )
}
