#!/usr/bin/env -S npx tsx
/**
 * Thin CLI wrapper around `consensus()`.
 *
 * Usage:
 *   pnpm cli --prompt "Summarize X in one sentence." \
 *            --models openai/gpt-5-mini,anthropic/claude-opus-4.6 \
 *            [--system "You are concise."] \
 *            [--embedding-model openai/text-embedding-3-small] \
 *            [--timeout 30000] \
 *            [--json]
 *
 * Exits 0 if at least one model succeeded, 1 otherwise.
 */

import { consensus } from './consensus.js'

interface Flags {
  prompt?: string
  models?: string
  system?: string
  embeddingModel?: string
  timeout?: string
  json?: boolean
  help?: boolean
}

function parseArgs(argv: readonly string[]): Flags {
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--prompt':
        flags.prompt = argv[++i]
        break
      case '--models':
        flags.models = argv[++i]
        break
      case '--system':
        flags.system = argv[++i]
        break
      case '--embedding-model':
        flags.embeddingModel = argv[++i]
        break
      case '--timeout':
        flags.timeout = argv[++i]
        break
      case '--json':
        flags.json = true
        break
      case '-h':
      case '--help':
        flags.help = true
        break
      default:
        process.stderr.write(`Unknown argument: ${a}\n`)
        process.exit(2)
    }
  }
  return flags
}

function usage(): string {
  return [
    'Usage: consensus --prompt <text> --models <m1,m2,...> [options]',
    '',
    'Options:',
    '  --prompt <text>             Prompt sent to every model (required)',
    '  --models <csv>              Comma-separated model ids (required)',
    '  --system <text>             System prompt applied to every model',
    '  --embedding-model <id>      Embedding model (default: openai/text-embedding-3-small)',
    '  --timeout <ms>              Per-model timeout in milliseconds (default: 60000)',
    '  --json                      Emit the full ConsensusResult as JSON',
    '  -h, --help                  Show this help',
    '',
    'Models use AI Gateway ids, e.g. "openai/gpt-5-mini", "anthropic/claude-opus-4.6".',
    'Requires AI_GATEWAY_API_KEY in the environment for non-zero-config providers.',
  ].join('\n')
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2))

  if (flags.help) {
    process.stdout.write(usage() + '\n')
    return
  }

  if (!flags.prompt || !flags.models) {
    process.stderr.write(usage() + '\n')
    process.exit(2)
  }

  const models = flags.models.split(',').map((m) => m.trim()).filter(Boolean)
  if (models.length === 0) {
    process.stderr.write('Error: --models produced no ids after parsing\n')
    process.exit(2)
  }

  const timeoutMs = flags.timeout ? Number(flags.timeout) : undefined
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    process.stderr.write('Error: --timeout must be a positive number\n')
    process.exit(2)
  }

  const result = await consensus({
    prompt: flags.prompt,
    models,
    ...(flags.system ? { system: flags.system } : {}),
    ...(flags.embeddingModel ? { embeddingModel: flags.embeddingModel } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
  })

  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } else {
    renderHuman(result)
  }

  process.exit(result.successCount > 0 ? 0 : 1)
}

function renderHuman(result: Awaited<ReturnType<typeof consensus>>): void {
  const lines: string[] = []
  const scorePct = (s: number | null) =>
    s === null ? '  n/a' : `${(s * 100).toFixed(1).padStart(5)}%`

  lines.push('')
  lines.push(`Models queried: ${result.responses.length}`)
  lines.push(`  succeeded:    ${result.successCount}`)
  lines.push(`  failed:       ${result.failureCount}`)
  lines.push(
    `Consensus:      ${
      result.consensusScore === null
        ? 'n/a (need at least 2 successful responses)'
        : `${(result.consensusScore * 100).toFixed(1)}% mean pairwise similarity`
    }`,
  )
  lines.push('')
  lines.push('Per-model results:')
  for (const r of result.responses) {
    const status = r.error ? 'FAIL' : 'OK  '
    lines.push(
      `  [${status}] ${scorePct(r.score)}  ${r.latencyMs
        .toString()
        .padStart(5)}ms  ${r.model}`,
    )
    if (r.error) {
      lines.push(`           error: ${r.error}`)
    }
  }
  lines.push('')
  if (result.best) {
    lines.push(`Best response (${result.best.model}):`)
    lines.push('  ' + result.best.text.split('\n').join('\n  '))
  } else {
    lines.push('No successful responses.')
  }
  lines.push('')
  process.stdout.write(lines.join('\n'))
}

main().catch((err) => {
  process.stderr.write(
    `consensus: fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
