# multi-llm-consensus

Query N LLMs in parallel with the same prompt, embed their responses, and score
each one by its mean cosine similarity to the others. The "best" response is
the most semantically central one. The group-level `consensusScore` tells you
how much the models agreed.

This is a small, honest building block. It does **not** claim to produce
"Byzantine fault-tolerant" consensus, "truth," or verified facts. Embedding
similarity measures how similar two strings *look* to a sentence encoder; it
does not distinguish "all models confidently wrong in the same way" from "all
models correct."

## What it gives you

- Parallel fan-out to any number of AI Gateway models
- Per-model latency, usage, error isolation (one failure doesn't kill the run)
- Per-response centrality score in [0, 1]
- Group-level mean pairwise similarity in [0, 1]
- Provider-agnostic core — the `generate` and `embed` adapters are swappable

## Install

From the repo root:

```bash
cd tools/multi-llm-consensus
pnpm install
```

## Use as a library

```ts
import { consensus } from 'multi-llm-consensus'

const result = await consensus({
  prompt: 'In one sentence, what is the capital of France?',
  models: [
    'openai/gpt-5-mini',
    'anthropic/claude-opus-4.6',
    'google/gemini-3-flash',
  ],
  system: 'Answer in a single sentence.',
})

console.log(result.best?.text)        // most central response
console.log(result.consensusScore)    // e.g. 0.94 — models strongly agreed
for (const r of result.responses) {
  console.log(r.model, r.score, r.latencyMs, r.error ?? 'ok')
}
```

### Environment

The default adapters use AI SDK 6 over the Vercel AI Gateway. Zero-config
providers (OpenAI, Anthropic, Google Vertex, Bedrock, Fireworks) work when the
project is deployed on Vercel. Other providers (xAI, Groq, etc.) require
`AI_GATEWAY_API_KEY` to be set.

## Use from the command line

```bash
pnpm cli \
  --prompt "Summarize the CAP theorem in one sentence." \
  --models openai/gpt-5-mini,anthropic/claude-opus-4.6,google/gemini-3-flash \
  --system "Be precise."
```

Add `--json` for machine-readable output. Exit code is `0` if at least one
model succeeded, `1` otherwise.

## Test

```bash
pnpm test
```

All tests use in-memory fakes — no network, no API keys required.

## How scoring works

1. Every model is called in parallel with the same prompt via the `generate`
   adapter. Each attempt is wrapped in a timeout (`timeoutMs`, default 60s) so
   one hanging model does not stall the others.
2. Successful responses are sent to the `embed` adapter in a single batch call
   so you pay one embedding round-trip regardless of how many models answered.
3. Pairwise cosine similarity is computed across the embeddings. Raw cosine
   runs from -1 to 1; we clamp to [0, 1] because negative similarity is not
   meaningfully different from zero for the "did these models agree?" question.
4. Each response's `score` is its mean similarity to every other successful
   response — a centrality measure. The response with the highest score is
   returned as `best`.
5. `consensusScore` is the mean of all unique pairwise similarities — a single
   number telling you how tightly the group clustered.

Requires at least two successful responses for scoring. With one success, that
response is returned as `best` with `score: null`.

## Swapping the provider

The core `consensus()` function accepts optional `generate` and `embed`
adapters. This is used by the tests to run against deterministic fakes, but
it's also how you'd bolt on a non-AI-SDK provider:

```ts
import { consensus, type GenerateFn, type EmbedFn } from 'multi-llm-consensus'

const myGenerate: GenerateFn = async ({ model, prompt }) => {
  // Call your provider, return { text, usage? }
}
const myEmbed: EmbedFn = async ({ model, values }) => {
  // Return an array of number[] the same length as values
}

await consensus({
  prompt: '...',
  models: ['provider/a', 'provider/b'],
  generate: myGenerate,
  embed: myEmbed,
})
```

## What this module deliberately does not do

- It does not verify facts. Pick-by-similarity rewards models that say the
  same thing, which is not the same as being correct.
- It does not vote across providers to reduce prompt injection — two jailbroken
  models agreeing still agree.
- It does not cache responses. Wrap it yourself if you need that.
- It does not retry. A failed model is reported as failed. Retry at your call
  site where you know the right policy.
