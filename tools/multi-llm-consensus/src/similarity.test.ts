import { describe, expect, it } from 'vitest'
import { centralityScores, cosineSimilarity } from './similarity.js'

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
  })

  it('clamps negative cosines to 0', () => {
    // [1, 0] and [-1, 0] have raw cosine -1; we clamp to 0 for the
    // "agreement" semantics documented in the module.
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(0)
  })

  it('returns 0 when either vector is zero-length', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0)
  })

  it('throws when dimensions mismatch', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length mismatch/)
  })

  it('is order-independent (symmetric)', () => {
    const a = [0.1, 0.9, 0.3]
    const b = [0.4, 0.2, 0.8]
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 12)
  })
})

describe('centralityScores', () => {
  it('returns nulls for an empty set', () => {
    expect(centralityScores([])).toEqual({ scores: [], meanPairwise: null })
  })

  it('returns a single null score for one vector', () => {
    expect(centralityScores([[1, 2, 3]])).toEqual({
      scores: [null],
      meanPairwise: null,
    })
  })

  it('marks the outlier with the lowest score', () => {
    // Two nearly identical vectors and one that disagrees. The outlier
    // should receive the lowest centrality score.
    const a = [1, 0, 0]
    const b = [0.99, 0.01, 0]
    const outlier = [0, 1, 0]
    const { scores, meanPairwise } = centralityScores([a, b, outlier])

    expect(scores).toHaveLength(3)
    const sa = scores[0] as number
    const sb = scores[1] as number
    const so = scores[2] as number
    expect(so).toBeLessThan(sa)
    expect(so).toBeLessThan(sb)
    expect(meanPairwise!).toBeGreaterThan(0)
    expect(meanPairwise!).toBeLessThan(1)
  })

  it('gives identical vectors perfect centrality', () => {
    const v = [1, 2, 3]
    const { scores, meanPairwise } = centralityScores([v, v, v])
    for (const s of scores as number[]) {
      expect(s).toBeCloseTo(1, 10)
    }
    expect(meanPairwise).toBeCloseTo(1, 10)
  })
})
