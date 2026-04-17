/**
 * Default adapters backed by AI SDK 6 + the Vercel AI Gateway.
 *
 * These are imported lazily so that the core `consensus()` function stays
 * usable in tests without pulling the SDK (and its network assumptions) into
 * the import graph.
 */

import type { EmbedFn, GenerateFn } from './types.js'

export const defaultGenerate: GenerateFn = async ({
  model,
  system,
  prompt,
  signal,
}) => {
  const { generateText } = await import('ai')
  const result = await generateText({
    model,
    system,
    prompt,
    abortSignal: signal,
  })
  return {
    text: result.text,
    usage: result.usage
      ? {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        }
      : undefined,
  }
}

export const defaultEmbed: EmbedFn = async ({ model, values, signal }) => {
  const { embedMany } = await import('ai')
  const result = await embedMany({
    model,
    values,
    abortSignal: signal,
  })
  return result.embeddings
}

export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small'
