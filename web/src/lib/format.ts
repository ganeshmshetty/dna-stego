export function fmtInt(value: number): string {
  return value.toLocaleString("en-US")
}

export function fmtBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function fmtGenes(value: number): string {
  return `${fmtInt(value)} ${value === 1 ? "gene" : "genes"}`
}

export function fmtPct(fraction: number, places = 2): string {
  return `${(fraction * 100).toFixed(places)}%`
}

export function fmtFixed(value: number, places = 3): string {
  return value.toFixed(places)
}
