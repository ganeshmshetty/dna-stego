import { cn } from "@/lib/utils"
import type { Coder } from "@/lib/types"

const CODERS: Array<{ value: Coder; label: string; description: string }> = [
  { value: "usage", label: "usage", description: "Match E. coli codon usage" },
  { value: "uniform", label: "uniform", description: "Equal bits per synonymous codon" },
]

interface CoderPickerProps {
  value: Coder
  onChange: (next: Coder) => void
  name: string
}

export function CoderPicker({ value, onChange, name }: CoderPickerProps) {
  return (
    <fieldset>
      <legend className="label">Coder</legend>
      <div className="mt-1.5 grid grid-cols-2 border border-rule">
        {CODERS.map((option, index) => (
          <label
            key={option.value}
            className={cn(
              "relative cursor-pointer px-3 py-2 transition-colors",
              index > 0 && "border-l border-rule",
              value === option.value
                ? "bg-ink text-paper"
                : "bg-paper text-ink-muted hover:text-ink",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="block text-[12px] leading-none">{option.label}</span>
            <span
              className={cn(
                "mt-1 block text-[10px] leading-snug",
                value === option.value ? "text-paper/70" : "text-ink-muted",
              )}
            >
              {option.description}
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
            />
          </label>
        ))}
      </div>
    </fieldset>
  )
}
