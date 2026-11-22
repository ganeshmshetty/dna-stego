export function fmtInt(value: number): string {
  return value.toLocaleString("en-US")
}

export function fmtBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function fmtPct(fraction: number, places = 2): string {
  return `${(fraction * 100).toFixed(places)}%`
}

export function fmtRate(value: number | null): string {
  return value === null ? "—" : value.toFixed(4)
}

export function fmtP(value: number): string {
  if (value === 0) return "0"
  if (value < 0.0001) return "<0.0001"
  return value.toFixed(4)
}

export function fmtFixed(value: number, places = 3): string {
  return value.toFixed(places)
}
