import type { ReactNode } from "react"

export function ErrorNote({ message, hint }: { message: string; hint: string }) {
  return (
    <div role="alert" className="border-l border-damaged pl-3">
      <p className="text-[12px] leading-snug text-damaged">{message}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{hint}</p>
    </div>
  )
}

export function EmptyState({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-[220px] flex-col justify-center border border-rule px-5 py-8">
      <h3 className="text-[13px] font-medium text-ink">{title}</h3>
      <div className="mt-1 max-w-[52ch] text-[12px] leading-relaxed text-ink-muted">{children}</div>
    </div>
  )
}
