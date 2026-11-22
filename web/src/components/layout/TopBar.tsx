import { Fragment } from "react"
import { Link, NavLink } from "react-router-dom"

import { useSession } from "@/lib/session"
import { cn } from "@/lib/utils"

const STEPS = [
  { number: "1", label: "Embed", to: "/embed" },
  { number: "2", label: "Damage", to: "/damage" },
  { number: "3", label: "Recover", to: "/recover" },
  { number: "4", label: "Verify", to: "/verify" },
  { number: "5", label: "Detect", to: "/detect" },
] as const

export function TopBar() {
  const { artifact } = useSession()
  const chain = [
    { label: "cover", done: Boolean(artifact?.cover) },
    { label: "message", done: Boolean(artifact?.message) },
    { label: "stego", done: Boolean(artifact?.stego) },
    { label: "channel", done: Boolean(artifact?.channel) },
    { label: "recovery", done: Boolean(artifact?.recovery) },
  ]
  const status = chain
    .map((entry) => `${entry.label} ${entry.done ? "✓" : "—"}`)
    .join(" · ")

  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          to="/embed"
          className="text-[15px] leading-none font-semibold tracking-[-0.015em] text-ink"
        >
          TraceDNA
        </Link>

        <nav aria-label="Pipeline" className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {STEPS.map((step, index) => (
            <Fragment key={step.to}>
              {index > 0 ? (
                <span aria-hidden="true" className="text-[10px] text-ink-muted">
                  ·
                </span>
              ) : null}
              <NavLink
                to={step.to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-baseline gap-1 border-b py-0.5 text-[12.5px] leading-none transition-colors",
                    isActive
                      ? "border-ink text-ink"
                      : "border-transparent text-ink-muted hover:border-rule hover:text-ink",
                  )
                }
              >
                <span className="num text-[9.5px] text-ink-muted">{step.number}</span>
                <span>{step.label}</span>
              </NavLink>
            </Fragment>
          ))}
        </nav>

        <div
          role="status"
          aria-live="polite"
          title={status}
          className="num ml-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px] leading-none text-ink-muted"
        >
          <span className="sr-only">
            Pipeline status:{" "}
            {chain
              .map((entry) => `${entry.label} ${entry.done ? "done" : "not done"}`)
              .join("; ")}
            .
          </span>
          <span aria-hidden="true" className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {chain.map((entry, index) => (
              <Fragment key={entry.label}>
                {index > 0 ? (
                  <span className="text-ink-muted">·</span>
                ) : null}
                <span className={entry.done ? "text-ink" : "text-ink-muted"}>
                  {entry.label}{" "}
                  <span className={entry.done ? "text-verified" : "text-ink-muted"}>
                    {entry.done ? "✓" : "—"}
                  </span>
                </span>
              </Fragment>
            ))}
          </span>
        </div>
      </div>
    </header>
  )
}
