# System Architecture Dossier & Agent Blueprint

> Status: Implemented as repository-aligned architecture documentation.  
> Scope: `gws` Google Workspace CLI design / operations / integration backlog.

## 1. Executive Summary

This dossier implements the requested blueprint format using the actual scope of this repository:

- Dynamic Google Workspace CLI runtime
- OAuth and credential management
- Request execution and validation safety
- Helper command architecture
- CI/CD and security automation
- Observability and release operations

The prior broad ecosystem request (Cloudflare / payment rails / web3 / multi-agent platforms) is preserved as an **external integration backlog** only and not as currently implemented architecture in this codebase.

## 2. Session Audit Checklist

- [x] Primary Prompt: Fix failing GitHub Actions File Labeler job
- [x] Primary Prompt: Broad Workers/integration request requiring clarification
- [x] Primary Prompt: Transcript-wide architecture synthesis request
- [ ] Unselected UI suggestions: not available in transcript export

## 3. Technical Modules

### Module A — Core CLI Runtime (Current Architecture)

1. **Core Agent Execution Flow**
   - Parse service intent from argv
   - Fetch Discovery document metadata
   - Build dynamic `clap` command tree
   - Re-parse arguments against generated command surface
   - Execute API request and render structured output

2. **Universal MCP Routing & Parallel Workflows**
   - Current repository does not ship a universal MCP gateway
   - Near-term compatibility path:
     - expose CLI operations as MCP tools via wrapper adapter
     - route schema discovery and command execution through tool contracts

3. **Cloudflare Edge / Hyperdrive / Storage Topology**
   - Not part of current `gws` runtime
   - Any edge execution pattern should treat `gws` as an upstream API client component

4. **Google Stack / Firebase / Local Execution**
   - Direct Google API interaction through OAuth-backed HTTP requests
   - Local execution remains standard CLI runtime on user hosts

5. **GitHub DevOps / Security / Automation**
   - CI workflows validate formatting / tests / release flow
   - Security posture includes secret scanning and review gates

6. **Monetization / Smart Contract Engine**
   - Out of scope for the repository runtime
   - Track only as external integration backlog

7. **Real-Time Tracking**
   - Monitor Google API Discovery changes and auth behavior changes
   - Monitor CLI release quality signals from CI and issue reports

8. **Observability + Strategic Points**
   - Key risks:
     - discovery schema drift
     - auth token precedence mistakes
     - unsafe input handling in helper commands
   - Key optimization:
     - keep output structured and filterable for AI agent usage

### Module B — Authentication / Credential Storage / Safety

1. **Core Flow**
   - Resolve auth source precedence:
     1) direct token env var
     2) credentials file env var
     3) encrypted local credentials
     4) plaintext fallback credentials
   - Acquire token and apply to request executor

2. **Security Controls**
   - Encrypted credential storage
   - Input validation helpers for file paths and resource names
   - URL path segment encoding and query builder safety

3. **Operational Risks**
   - invalid credential source precedence
   - stale refresh credentials in CI/headless contexts
   - unsafe path handling in helper workflows

### Module C — Helper Commands and Extensibility

1. **Core Flow**
   - Keep Discovery-first model as default path
   - Add `+verb` helper commands only for multi-step orchestration value

2. **Acceptance Criteria for New Helpers**
   - does not duplicate a single Discovery API call
   - adds orchestration or translation value
   - validates all untrusted CLI inputs
   - includes happy-path and rejection-path tests

3. **Strategic Risks**
   - helper sprawl that re-implements discovery parameters
   - inconsistent validation across helper modules

### Module D — DevOps / Release / Quality Gates

1. **CI/CD**
   - enforce lint/test/build checks
   - include changeset for every PR
   - maintain reproducible release flow

2. **Security**
   - run secret scanning on changed files
   - run code review and CodeQL validation before finalization

3. **Acceptance Metrics**
   - all required checks passing on PR
   - no high-confidence security findings left unresolved
   - release artifacts generated from clean mainline

### Module E — External Integration Backlog (Non-Implemented in Repo)

Requested domains captured for future companion systems:

- Multi-agent orchestration stacks (LangGraph / LangChain / LangSmith / LangSwarm / OpenHands / Hermes / Kimi / Rork)
- Cloudflare edge components (Workers / Durable Objects / Hyperdrive / D1 / Vectorize / KV / R2 / Queues)
- Google cloud companion services (Vertex / Cloud Run / GKE / Firebase)
- Local agent runtime tooling (Termux / PM2 / Obsidian memory workflows)
- Monetization and settlement rails (Stripe / Square / Circle / smart contracts)

Backlog rule:
- treat these as separate architecture tracks unless an accepted repository RFC introduces them to `gws`.

## 4. Final Master Synchronization Roadmap

1. Strengthen discovery-driven runtime reliability
   - deliverable: schema fetch/cache error handling tests
2. Harden authentication and credential UX
   - deliverable: expanded auth precedence and failure-path tests
3. Expand safe helper command surface
   - deliverable: helper checklist enforcement and validation tests
4. Maintain strict DevSecOps gates
   - deliverable: CI policy compliance with zero skipped required checks
5. Track external integration backlog as companion work
   - deliverable: separate RFC/issues for non-core platform integrations
