import { Fragment, useEffect } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"

const STEPS = [
  { number: "1", label: "Embed", to: "/embed" },
  { number: "2", label: "Damage", to: "/damage" },
  { number: "3", label: "Recover", to: "/recover" },
  { number: "4", label: "Verify", to: "/verify" },
  { number: "5", label: "Detect", to: "/detect" },
] as const

export function TopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    function isEditable(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      )
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.shiftKey || event.isComposing) return
      if (event.metaKey || event.ctrlKey) return

      const alt = event.altKey
      let digit: string | null = /^[1-5]$/.test(event.key) ? event.key : null

      // macOS Option+digit reports a transformed event.key (e.g. "¡" for
      // Option+1), so fall back to the physical number-row key for Alt.
      if (!digit && alt) {
        const codeMatch = /^(?:Digit|Numpad)([1-5])$/.exec(event.code)
        digit = codeMatch ? codeMatch[1] : null
      }

      if (!digit) return
      if (!alt && isEditable(event.target)) return

      const target = STEPS[Number(digit) - 1]
      if (!target) return

      event.preventDefault()
      event.stopPropagation()
      navigate(target.to)
    }

    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true })
    }
  }, [navigate])

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper">
      <div className="mx-auto flex h-[55px] w-full max-w-[1120px] items-stretch justify-center px-4 sm:px-6">
        <nav aria-label="Steps" className="flex items-stretch justify-center">
          {STEPS.map((step, index) => {
            const active = pathname === step.to
            return (
              <Fragment key={step.to}>
                {index > 0 ? (
                  <span aria-hidden="true" className="h-3 w-px self-center bg-rule" />
                ) : null}
                <Link
                  to={step.to}
                  aria-current={active ? "step" : undefined}
                  aria-keyshortcuts={`Alt+${step.number}`}
                  className={cn(
                    "relative inline-flex items-center gap-1 px-1.5 text-[11px] leading-none transition-colors sm:gap-1.5 sm:px-4 sm:text-[12.5px]",
                    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    active ? "text-ink" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <span className="num text-[8.5px] leading-none sm:text-[10px]">
                    {step.number}
                  </span>
                  <span className="font-normal">{step.label}</span>
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-px h-px bg-ink"
                    />
                  ) : null}
                </Link>
              </Fragment>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
