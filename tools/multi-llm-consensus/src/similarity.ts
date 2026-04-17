/**
 * Small, dependency-free vector helpers.
 *
 * Kept separate from `consensus.ts` so they can be unit-tested in isolation.
 */

export function dot(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector length mismatch: ${a.length} vs ${b.length}. Embeddings from ` +
        `different models cannot be compared directly.`,
    )
  }
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] as number) * (b[i] as number)
  }
  return sum
}

export function norm(a: readonly number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const v = a[i] as number
    sum += v * v
  }
  return Math.sqrt(sum)
}

/**
 * Cosine similarity clamped into [0, 1].
 *
 * Raw cosine is in [-1, 1], but for the "how much do models agree?" use case
 * a negative score is not meaningfully different from zero — both mean "these
 * responses are unrelated or opposed." Clamping to [0, 1] keeps downstream
 * consumers (dashboards, thresholds) simpler.
 */
export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  const na = norm(a)
  const nb = norm(b)
  if (na === 0 || nb === 0) return 0
  const raw = dot(a, b) / (na * nb)
  if (raw <= 0) return 0
  if (raw >= 1) return 1
  return raw
}

/**
 * Compute per-item centrality scores and the overall mean pairwise similarity.
 *
 * - `scores[i]` = mean similarity of vector `i` to all other vectors.
 *   This tells us how "central" response `i` is relative to the group.
 * - `meanPairwise` = mean similarity across all unique (i, j) pairs with i < j.
 *   This tells us how much the group as a whole agrees.
 *
 * Both are `null` when there are fewer than two vectors.
 */
export function centralityScores(vectors: readonly (readonly number[])[]): {
  scores: (number | null)[]
  meanPairwise: number | null
} {
  const n = vectors.length
  if (n === 0) return { scores: [], meanPairwise: null }
  if (n === 1) return { scores: [null], meanPairwise: null }

  const sims: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  let pairSum = 0
  let pairCount = 0

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = cosineSimilarity(
        vectors[i] as readonly number[],
        vectors[j] as readonly number[],
      )
      ;(sims[i] as number[])[j] = s
      ;(sims[j] as number[])[i] = s
      pairSum += s
      pairCount += 1
    }
  }

  const scores: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      sum += (sims[i] as number[])[j] as number
    }
    scores[i] = sum / (n - 1)
  }

  return {
    scores,
    meanPairwise: pairCount === 0 ? null : pairSum / pairCount,
  }
}
