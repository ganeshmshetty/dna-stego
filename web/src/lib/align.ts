/**
 * Needleman–Wunsch over two short strands, for the single-strand diff on the
 * Channel page. O(n·m) with n, m <= a few hundred nucleotides.
 */

export interface Alignment {
  /** Aligned before sequence; "-" marks an insertion in the after sequence. */
  before: string
  /** Aligned after sequence; "-" marks a deletion from the before sequence. */
  after: string
  changed: boolean[]
}

export function alignSequences(before: string, after: string): Alignment {
  const n = before.length
  const m = after.length
  const width = m + 1
  const score = new Int16Array((n + 1) * width)

  for (let i = 0; i <= n; i += 1) score[i * width] = -i
  for (let j = 0; j <= m; j += 1) score[j] = -j

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const diagonal =
        score[(i - 1) * width + (j - 1)] + (before[i - 1] === after[j - 1] ? 1 : -1)
      const up = score[(i - 1) * width + j] - 1
      const left = score[i * width + (j - 1)] - 1
      score[i * width + j] = Math.max(diagonal, up, left)
    }
  }

  const beforeOut: string[] = []
  const afterOut: string[] = []
  const changed: boolean[] = []
  let i = n
  let j = m

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const same = before[i - 1] === after[j - 1]
      const diagonal = score[(i - 1) * width + (j - 1)] + (same ? 1 : -1)
      if (score[i * width + j] === diagonal) {
        beforeOut.push(before[i - 1])
        afterOut.push(after[j - 1])
        changed.push(!same)
        i -= 1
        j -= 1
        continue
      }
    }
    if (i > 0 && score[i * width + j] === score[(i - 1) * width + j] - 1) {
      beforeOut.push(before[i - 1])
      afterOut.push("-")
      changed.push(true)
      i -= 1
      continue
    }
    beforeOut.push("-")
    afterOut.push(after[j - 1])
    changed.push(true)
    j -= 1
  }

  return {
    before: beforeOut.reverse().join(""),
    after: afterOut.reverse().join(""),
    changed: changed.reverse(),
  }
}
