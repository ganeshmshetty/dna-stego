import { Fragment } from "react"
import { Link, NavLink } from "react-router-dom"

import { useSession } from "@/lib/session"
import { fmtInt } from "@/lib/format"
import { cn } from "@/lib/utils"

const STEPS = [
  { number: "1", label: "Encode", to: "/encode" },
  { number: "2", label: "Channel", to: "/channel" },
  { number: "3", label: "Recover", to: "/recover" },
  { number: "4", label: "Verify", to: "/verify" },
  { number: "5", label: "Results", to: "/results" },
] as const

export function TopBar() {
  const { artifact } = useSession()
  const status = artifact
    ? `file: ${artifact.file.name} · ${fmtInt(artifact.stats.strand_count)} strands · key: ${artifact.recipient}`
    : "no artifact · start at 1 Encode"

  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          to="/encode"
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

        <p
          title={status}
          className="num ml-auto min-w-0 max-w-full truncate text-[10.5px] leading-none text-ink-muted sm:max-w-[440px]"
        >
          {status}
        </p>
      </div>
    </header>
  )
}
