import type { ReactNode } from "react"

interface PageProps {
  step: string
  title: string
  description: ReactNode
  children: ReactNode
}

export function Page({ step, title, description, children }: PageProps) {
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6">
      <header className="mb-6 border-b border-rule pb-4">
        <p className="label">{step}</p>
        <h1 className="mt-1 text-[21px] leading-tight font-medium tracking-[-0.01em] text-ink">
          {title}
        </h1>
        <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-ink-muted">
          {description}
        </p>
      </header>
      {children}
    </main>
  )
}
