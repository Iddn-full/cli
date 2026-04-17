/**
 * Public types for the multi-LLM consensus module.
 *
 * The module is intentionally provider-agnostic: the runtime depends only on
 * two small callbacks (`generate` and `embed`) which default to AI SDK 6
 * bindings over the Vercel AI Gateway, but can be swapped for mocks in tests
 * or for any other provider.
 */

export interface GenerateInput {
  model: string
  system?: string
  prompt: string
  /** Abort signal for cancellation / timeout. */
  signal?: AbortSignal
}

export interface GenerateOutput {
  text: string
  /** Optional usage info surfaced by the underlying SDK. */
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

export type GenerateFn = (input: GenerateInput) => Promise<GenerateOutput>

export interface EmbedInput {
  model: string
  values: string[]
  signal?: AbortSignal
}

export type EmbedFn = (input: EmbedInput) => Promise<number[][]>

export interface ConsensusOptions {
  /** The user prompt sent to every model. */
  prompt: string
  /**
   * List of model identifiers. With the default adapter these are AI Gateway
   * strings like `"openai/gpt-5-mini"` or `"anthropic/claude-opus-4.6"`.
   */
  models: string[]
  /** Optional system prompt applied to every model. */
  system?: string
  /**
   * Embedding model used to score responses against each other.
   * Defaults to `"openai/text-embedding-3-small"` with the built-in adapter.
   */
  embeddingModel?: string
  /** Per-request timeout in milliseconds. Default: 60_000. */
  timeoutMs?: number
  /**
   * Override the generation adapter. Useful for testing or for wiring up a
   * non-AI-SDK provider.
   */
  generate?: GenerateFn
  /** Override the embedding adapter. */
  embed?: EmbedFn
}

export interface ModelResponse {
  model: string
  /** Response text, or empty string if the call errored. */
  text: string
  /** Wall-clock latency of the generate call in milliseconds. */
  latencyMs: number
  /**
   * Consensus score in [0, 1]: the mean cosine similarity between this
   * response's embedding and every other successful response's embedding.
   * `null` when there are fewer than two successful responses, or when the
   * embedding step was skipped because this response errored.
   */
  score: number | null
  /** Set when the generate call failed. `text` will be empty in that case. */
  error?: string
  usage?: GenerateOutput['usage']
}

export interface ConsensusResult {
  /**
   * The response with the highest score, i.e. the one most semantically
   * central among the successful responses. `null` if no model succeeded.
   */
  best: ModelResponse | null
  /** All responses, including failed ones, in the order the models were given. */
  responses: ModelResponse[]
  /**
   * Mean pairwise cosine similarity across all successful responses, in [0, 1].
   * Higher = models agreed more. `null` when fewer than two models succeeded.
   */
  consensusScore: number | null
  /** Number of models that returned a response without erroring. */
  successCount: number
  /** Number of models that errored or timed out. */
  failureCount: number
}
