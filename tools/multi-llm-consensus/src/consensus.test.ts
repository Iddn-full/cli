import { describe, expect, it, vi } from 'vitest'
import { consensus } from './consensus.js'
import type { EmbedFn, GenerateFn } from './types.js'

/**
 * Build a fake generate function whose outputs are driven by the model id.
 * Each entry in `responses` maps a model id to either a string response or
 * an Error to throw.
 */
function fakeGenerate(
  responses: Record<string, string | Error>,
  opts: { delayMs?: number } = {},
): GenerateFn {
  return async ({ model, signal }) => {
    if (opts.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, opts.delayMs)
        signal?.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new Error('aborted'))
        })
      })
    }
    const out = responses[model]
    if (out === undefined) {
      throw new Error(`no fake response configured for model: ${model}`)
    }
    if (out instanceof Error) throw out
    return { text: out, usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }
  }
}

/**
 * Fake embedder that projects each string onto a deterministic vector.
 * Strings that start with the same character are mapped close together so
 * tests can reason about consensus without calling a real embedding model.
 */
const fakeEmbed: EmbedFn = async ({ values }) => {
  // One dimension per letter of the alphabet; the first character selects the
  // hot slot. Different starting letters therefore land in different buckets
  // (A and Z are NOT aliased), while same-letter strings cluster tightly.
  const DIMS = 26
  return values.map((v) => {
    const c = (v[0] ?? ' ').toUpperCase()
    const base = Math.max(
      0,
      Math.min(DIMS - 1, c.charCodeAt(0) - 'A'.charCodeAt(0)),
    )
    const vec = new Array(DIMS).fill(0) as number[]
    vec[base] = 1
    // Tiny length-based perturbation so identical-bucket strings are close
    // but not literally identical.
    vec[(base + 1) % DIMS] = Math.min(v.length / 10000, 0.001)
    return vec
  })
}

describe('consensus()', () => {
  it('rejects an empty model list', async () => {
    await expect(
      consensus({ prompt: 'hi', models: [], generate: fakeGenerate({}), embed: fakeEmbed }),
    ).rejects.toThrow(/at least one model/)
  })

  it('rejects duplicate models', async () => {
    await expect(
      consensus({
        prompt: 'hi',
        models: ['a', 'a'],
        generate: fakeGenerate({ a: 'x' }),
        embed: fakeEmbed,
      }),
    ).rejects.toThrow(/unique/)
  })

  it('rejects an empty prompt', async () => {
    await expect(
      consensus({
        prompt: '   ',
        models: ['a'],
        generate: fakeGenerate({ a: 'x' }),
        embed: fakeEmbed,
      }),
    ).rejects.toThrow(/non-empty prompt/)
  })

  it('returns a single response with null score when only one model is given', async () => {
    const res = await consensus({
      prompt: 'q',
      models: ['m1'],
      generate: fakeGenerate({ m1: 'Apples are red' }),
      embed: fakeEmbed,
    })
    expect(res.successCount).toBe(1)
    expect(res.failureCount).toBe(0)
    expect(res.consensusScore).toBeNull()
    expect(res.best?.model).toBe('m1')
    expect(res.best?.score).toBeNull()
  })

  it('picks the most central response when models agree', async () => {
    // m1 and m2 both answer "Apples are red" (same bucket).
    // m3 answers "Zebra stripes" (different bucket).
    // Expected: m1 or m2 wins, m3 gets the lowest score.
    const res = await consensus({
      prompt: 'describe something',
      models: ['m1', 'm2', 'm3'],
      generate: fakeGenerate({
        m1: 'Apples are red',
        m2: 'Apples taste sweet',
        m3: 'Zebras have stripes',
      }),
      embed: fakeEmbed,
    })

    expect(res.successCount).toBe(3)
    expect(res.failureCount).toBe(0)
    expect(res.best?.model === 'm1' || res.best?.model === 'm2').toBe(true)

    const m3 = res.responses.find((r) => r.model === 'm3')!
    const m1 = res.responses.find((r) => r.model === 'm1')!
    expect(m3.score!).toBeLessThan(m1.score!)
    expect(res.consensusScore).toBeGreaterThan(0)
    expect(res.consensusScore).toBeLessThan(1)
  })

  it('isolates per-model failures', async () => {
    const res = await consensus({
      prompt: 'q',
      models: ['ok1', 'broken', 'ok2'],
      generate: fakeGenerate({
        ok1: 'Apples one',
        broken: new Error('upstream 500'),
        ok2: 'Apples two',
      }),
      embed: fakeEmbed,
    })

    expect(res.successCount).toBe(2)
    expect(res.failureCount).toBe(1)

    const broken = res.responses.find((r) => r.model === 'broken')!
    expect(broken.error).toMatch(/upstream 500/)
    expect(broken.text).toBe('')
    expect(broken.score).toBeNull()

    // best must be a successful model
    expect(res.best?.model).not.toBe('broken')
    expect(res.best?.error).toBeUndefined()
  })

  it('returns null best when every model fails', async () => {
    const res = await consensus({
      prompt: 'q',
      models: ['a', 'b'],
      generate: fakeGenerate({
        a: new Error('boom'),
        b: new Error('boom'),
      }),
      embed: fakeEmbed,
    })
    expect(res.best).toBeNull()
    expect(res.successCount).toBe(0)
    expect(res.failureCount).toBe(2)
    expect(res.consensusScore).toBeNull()
  })

  it('times out slow models without aborting fast ones', async () => {
    const fastGen: GenerateFn = async ({ model }) => ({ text: `fast-${model}` })
    const slowGen: GenerateFn = ({ signal }) =>
      new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })

    // Route by model id.
    const gen: GenerateFn = (input) =>
      input.model === 'slow' ? slowGen(input) : fastGen(input)

    const res = await consensus({
      prompt: 'q',
      models: ['fast1', 'slow', 'fast2'],
      timeoutMs: 50,
      generate: gen,
      embed: fakeEmbed,
    })

    expect(res.successCount).toBe(2)
    expect(res.failureCount).toBe(1)
    const slow = res.responses.find((r) => r.model === 'slow')!
    expect(slow.error).toBeDefined()
  })

  it('surfaces embed failures on successful responses and returns null consensus', async () => {
    const brokenEmbed: EmbedFn = async () => {
      throw new Error('embedding service unavailable')
    }
    const res = await consensus({
      prompt: 'q',
      models: ['a', 'b'],
      generate: fakeGenerate({ a: 'Apples', b: 'Apples ii' }),
      embed: brokenEmbed,
    })

    expect(res.successCount).toBe(2)
    expect(res.consensusScore).toBeNull()
    for (const r of res.responses) {
      expect(r.error).toMatch(/embed failed/)
    }
    expect(res.best).toBeNull()
  })

  it('runs model calls in parallel, not serially', async () => {
    const delayMs = 60
    const gen = fakeGenerate(
      { a: 'Apples', b: 'Apples two', c: 'Apples three' },
      { delayMs },
    )
    const start = Date.now()
    await consensus({
      prompt: 'q',
      models: ['a', 'b', 'c'],
      generate: gen,
      embed: fakeEmbed,
    })
    const elapsed = Date.now() - start
    // If the calls ran serially we'd expect >= 3 * delayMs = 180ms.
    // Allow generous slack for slow CI: cap at 2 * delayMs.
    expect(elapsed).toBeLessThan(delayMs * 2)
  })

  it('records latency per model', async () => {
    const res = await consensus({
      prompt: 'q',
      models: ['a', 'b'],
      generate: fakeGenerate({ a: 'Apples one', b: 'Apples two' }, { delayMs: 20 }),
      embed: fakeEmbed,
    })
    for (const r of res.responses) {
      expect(r.latencyMs).toBeGreaterThanOrEqual(15)
    }
  })

  it('does not call embed when fewer than two responses succeed', async () => {
    const embedSpy = vi.fn(fakeEmbed)
    await consensus({
      prompt: 'q',
      models: ['a', 'b'],
      generate: fakeGenerate({ a: 'Apples', b: new Error('down') }),
      embed: embedSpy,
    })
    expect(embedSpy).not.toHaveBeenCalled()
  })
})
