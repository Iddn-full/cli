/**
 * Core consensus routine.
 *
 * Given a prompt and a list of model identifiers, queries every model in
 * parallel, embeds their responses, and scores each response by its mean
 * cosine similarity to the others. The response most semantically central
 * to the group is returned as `best`, alongside a group-level
 * `consensusScore`.
 *
 * Design choices:
 * - Failures are isolated: one model timing out does not abort the others.
 *   Failed models surface in `responses` with `error` set and `score: null`.
 * - Scoring requires at least two successful responses. With one success,
 *   that response is returned as `best` with `score: null`.
 * - Embeddings are requested in a single `embedMany` call so we pay one
 *   round-trip regardless of how many models succeeded.
 * - The routine is provider-agnostic via the `generate` / `embed` hooks.
 */

import { DEFAULT_EMBEDDING_MODEL, defaultEmbed, defaultGenerate } from './adapters.js'
import { centralityScores } from './similarity.js'
import type {
  ConsensusOptions,
  ConsensusResult,
  ModelResponse,
} from './types.js'

interface RawAttempt {
  model: string
  text: string
  latencyMs: number
  error?: string
  usage?: ModelResponse['usage']
}

export async function consensus(
  options: ConsensusOptions,
): Promise<ConsensusResult> {
  const {
    prompt,
    models,
    system,
    embeddingModel = DEFAULT_EMBEDDING_MODEL,
    timeoutMs = 60_000,
    generate = defaultGenerate,
    embed = defaultEmbed,
  } = options

  if (models.length === 0) {
    throw new Error('consensus() requires at least one model')
  }
  if (new Set(models).size !== models.length) {
    throw new Error('consensus() requires unique model identifiers')
  }
  if (!prompt.trim()) {
    throw new Error('consensus() requires a non-empty prompt')
  }

  // Step 1: query all models in parallel. Each attempt is wrapped so a single
  // failure doesn't take the whole call down.
  const attempts = await Promise.all(
    models.map((model) => runSingle(model, prompt, system, timeoutMs, generate)),
  )

  const successes = attempts.filter((a) => !a.error && a.text.length > 0)
  const successCount = successes.length
  const failureCount = attempts.length - successCount

  // Step 2: build the response list in original order, with score slots
  // initialized based on whether the attempt succeeded.
  const responses: ModelResponse[] = attempts.map((a) => ({
    model: a.model,
    text: a.text,
    latencyMs: a.latencyMs,
    score: null,
    ...(a.error ? { error: a.error } : {}),
    ...(a.usage ? { usage: a.usage } : {}),
  }))

  // Step 3: if we have 2+ successes, embed them and compute centrality.
  let consensusScore: number | null = null

  if (successCount >= 2) {
    const values = successes.map((s) => s.text)
    let embeddings: number[][]
    try {
      embeddings = await embed({ model: embeddingModel, values })
    } catch (err) {
      // Embedding failure is non-fatal: we still return the responses, just
      // without scores. Surface the error on every successful response so the
      // caller can see why scoring was skipped.
      const msg = `embed failed: ${errMessage(err)}`
      for (const s of successes) {
        const target = responses.find((r) => r.model === s.model)
        if (target) target.error = msg
      }
      return {
        best: null,
        responses,
        consensusScore: null,
        successCount,
        failureCount,
      }
    }

    if (embeddings.length !== successes.length) {
      throw new Error(
        `embed() returned ${embeddings.length} vectors for ${successes.length} inputs`,
      )
    }

    const { scores, meanPairwise } = centralityScores(embeddings)
    consensusScore = meanPairwise

    for (let i = 0; i < successes.length; i++) {
      const successAttempt = successes[i] as RawAttempt
      const target = responses.find((r) => r.model === successAttempt.model)
      if (target) target.score = scores[i] ?? null
    }
  }

  const best = pickBest(responses)

  return {
    best,
    responses,
    consensusScore,
    successCount,
    failureCount,
  }
}

async function runSingle(
  model: string,
  prompt: string,
  system: string | undefined,
  timeoutMs: number,
  generate: NonNullable<ConsensusOptions['generate']>,
): Promise<RawAttempt> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error(`timeout after ${timeoutMs}ms`))
  }, timeoutMs)

  const start = Date.now()
  try {
    const out = await generate({
      model,
      system,
      prompt,
      signal: controller.signal,
    })
    return {
      model,
      text: out.text ?? '',
      latencyMs: Date.now() - start,
      ...(out.usage ? { usage: out.usage } : {}),
    }
  } catch (err) {
    return {
      model,
      text: '',
      latencyMs: Date.now() - start,
      error: errMessage(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

function pickBest(responses: readonly ModelResponse[]): ModelResponse | null {
  // Prefer the response with the highest score. Fall back to the first
  // successful response when scoring was skipped (single success, or embed
  // failure). Return null if no model succeeded.
  let bestScored: ModelResponse | null = null
  let bestScore = -Infinity
  let firstSuccess: ModelResponse | null = null

  for (const r of responses) {
    if (r.error || !r.text) continue
    if (firstSuccess === null) firstSuccess = r
    if (r.score !== null && r.score > bestScore) {
      bestScored = r
      bestScore = r.score
    }
  }

  return bestScored ?? firstSuccess
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
