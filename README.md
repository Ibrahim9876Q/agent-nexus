# Agent Nexus

A local-first development orchestrator for independently authenticated Codex accounts. Coordinate workers, let them request their own delegated workers, and inspect tasks, messages, approvals, and isolated Git worktrees in a live React dashboard.

**Status: functional local MVP.** The mock end-to-end workflow is tested. The real Codex adapter initializes three isolated processes and creates threads with coordination tools against Codex `0.167.0-alpha.3.2`. Authenticated inference, native subagent execution, and remote PR publishing still require integration validation with your accounts. A successful model catalog response is not an entitlement check.

## Run on Windows

Install Node.js **24.13 or newer**, Git, and the official Codex CLI. Install GitHub CLI for optional repository publishing. Use a normal PowerShell terminal:

```powershell
npm ci
npm run build
npm test
npm start
```

Open <http://127.0.0.1:4310>. Click **Run three-account demo** for a real local Git workflow using simulated accounts. No model usage or GitHub publication occurs in the demo.

If `codex` is not a native executable on your PATH, copy `.env.example` to `.env` and set `NEXUS_CODEX_BIN` to the absolute path to `codex.exe`. The runtime deliberately does not execute shell command strings or Windows `.cmd` wrappers. `npm start` loads `.env` automatically. Stop with Ctrl+C. The application binds only to `127.0.0.1`.

For frontend development, run `npm run build` after edits and reload. If `dist/` is absent, the server uses Vite middleware.

## Connect your accounts

1. Open **Settings → Add account**, name it, and choose **Codex**.
2. Click **Sign in with ChatGPT** and complete the official browser flow. Sign in one account at a time so browser callback listeners do not conflict. Use the intended account in the login page; Nexus does not copy your existing desktop login.
3. Click **Verify connection**. Repeat for your other accounts.
4. Add an existing Git repository with at least one commit under **Repositories**.
5. Create a project and select a ready coordinator account. The coordinator inspects the repository and submits a DAG through `nexus_plan`. Alternatively, assign a precise task from **Task board → Add task**.

Each account has a separate `.nexus/accounts/<id>/` Codex home and its own app-server process. The official runtime stores credentials there using its supported file backend. Nexus does not read auth.json, ask for passwords, combine subscriptions, or switch accounts to bypass limits. Keep `.nexus/` private and restrict access to your operating-system user. Browser verification means authentication exists; a completed inference turn verifies actual model access.

For optional API-key authentication, use the official `codex login --with-api-key` command yourself with that account's `CODEX_HOME`, then verify it in Nexus. API use is separately billed. Never put an API key in a task, note, source file, or CLI argument.

## Agents can deploy their own helpers

Every worker receives `nexus_delegate`. It can request a child without another manual assignment, and children can request grandchildren. Nexus checks the account pool cap and nesting depth, preserves the parent account/project/permissions, creates a separate branch/worktree, and queues the child through the same scheduler. A parent that ends its turn before a child reports becomes blocked; receipt of the result queues continuation. The parent must explicitly acknowledge the result.

These are labeled **worker-delegation**, not native Codex subagents. This is the default for coding because concurrent writers require separate worktrees.

For native Codex research subagents, set **Native research helpers** above zero and assign a **read-only** task. Nexus enables native tools and reserves `1 + nativeLimit` slots for that session, counting them against account/global concurrency. Native children use their parent as the external messaging bridge. Native activity appears in the event log; individual native children are not yet fully represented in the agent tree. Write-enabled sessions disable native subagents to avoid shared-worktree edits. Current default: 2 execution slots/account, 6 globally, depth 3, pool 12, native research helpers 0.

## What works

- SQLite persistence, account/agent registry, restart recovery and an audit event feed.
- Live WebSocket dashboard: overview, worker lineage, Kanban tasks, clickable dependency relationships, messages, repositories, knowledge, settings, approvals.
- Deterministic DAG validation and scheduling, account/global limits, priority ordering, advisory file-scope reservations, pause, interrupt, explicit retry.
- Durable direct messages, deduplication, retry/backoff, expiry, delivered vs acknowledged states, project isolation.
- Official app-server initialization, browser login, account checks, resumable threads, streamed output, steering, interruption, host tool calls and command/file approval prompts.
- Agent tools for discovery, planning, direct messages, inbox polling, acknowledgments, waiting and recursive worker delegation.
- Isolated Git worktrees, change summaries, local commits and approval-gated draft PR publishing through GitHub CLI. No automatic merge or force-push.
- Optional curated Markdown knowledge, project-scoped search and immutable writes. Open `.nexus/knowledge` as an Obsidian vault.

## Validation

```powershell
npm test               # Core, scheduler, HTTP/WebSocket and Git end-to-end tests
npm run build         # Strict TypeScript check and production dashboard build
npm run demo          # Three-account scenario with evidence printed as JSON
npm run check:codex    # Three isolated real processes; no login or inference
```

The acceptance demo creates a disposable local repository. Account B implements a greeting backend; Account C requests its contract, acknowledges it, implements the frontend and receives readiness. B autonomously delegates contract review. A review worker cherry-picks both commits into its own integration branch and runs a Node test. A coordinator records a summary. The original `main` branch is unchanged. Tests also execute two repositories concurrently and reject cross-project access.

Tests create temporary repositories and worktrees; no destructive cleanup or global Git configuration changes occur. On restricted execution hosts, Git metadata writes or loopback sockets may need an approved non-sandboxed test run. SQLite's built-in Node API currently emits an experimental warning.

## Important MVP boundaries

- Real three-account inference needs your interactive logins. See [real account validation](docs/REAL_ACCOUNTS.md).
- The coordination tools use the documented **experimental** app-server dynamic-tool interface. Regenerate/check the protocol when upgrading Codex; unsupported requests fail closed.
- A completed agent turn is a report, not proof tests passed. Inspect changes and independently review before committing/publishing.
- Dependencies control scheduling; their changes are **not automatically merged** into the next worktree. Prerequisite branch/worktree/report references are supplied to the dependent agent. The demo integration uses cherry-picks only inside its generated fixture.
- Pause interrupts active turns; resuming scheduling does not automatically replay interrupted tasks. Inspect and explicitly resume each task.
- Scope reservations are hints, not filesystem enforcement. Codex sandboxing is the execution boundary. Local repositories and agents are assumed to belong to one trusted user; this is not a multi-tenant isolation product. Prompt-injection resistance also depends on runtime sandbox/approval enforcement.
- General group/topic messaging, cross-repository dependency links, automatic failed-task reassignment, GitHub clone/issue/CI browsing, semantic search, external MCP exposure, and PostgreSQL are follow-up work. The current dependency view is a relationship list, not a pan/zoom graph canvas.
- Knowledge credential detection catches common formats; it is not a complete secret scanner. Notes are opt-in, with no automatic log export.
- Unsupported runtime permission/user-input requests are denied rather than silently granted. Test Windows Codex sandbox setup before assigning writable tasks.

## Source layout

```text
src/server.ts             Local HTTP/WebSocket API
src/engine.ts             Worker lifecycle, scheduler and coordination tools
src/bus.ts                Durable message delivery
src/db/                   SQLite store and migration
src/providers/codex.ts    Isolated official app-server processes
src/integrations/         Git and Markdown knowledge
src/simulation.ts         Executable acceptance fixture
web/                     React dashboard and Tailwind/CSS
tests/                   Automated verification
scripts/                 CLI demo and runtime probe
docs/                    Architecture and real-account test procedure
```

See [architecture](docs/ARCHITECTURE.md), [security](SECURITY.md), and [delivery plan](docs/ROADMAP.md). Local state, auth files, notes, build outputs and dependencies are ignored by Git. The GitHub remote is private until you explicitly choose to publish it publicly.

## Official references

Implementation checked on November 10, 2026 against the installed runtime and [app-server documentation](https://learn.chatgpt.com/docs/app-server), [authentication](https://learn.chatgpt.com/docs/auth), [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Licensed under MIT.
