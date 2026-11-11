# Architecture

The dashboard and API run in one local Node process. Every real account owns a separate official Codex app-server process over stdio. A worker identity corresponds to one resumable thread. Worker-level children get separate threads and worktrees; native research children are runtime-managed and communicate externally through their parent.

```mermaid
flowchart LR
  UI[React dashboard] <-->|HTTP + WebSocket| API[Local Nexus server]
  API --> DB[(SQLite)]
  API --> Scheduler[DAG scheduler]
  Scheduler --> A[Account A app-server]
  Scheduler --> B[Account B app-server]
  Scheduler --> C[Account C app-server]
  A <-->|dynamic tools| Bus[Durable message bus]
  B <-->|dynamic tools| Bus
  C <-->|dynamic tools| Bus
  Bus --> DB
  Scheduler --> Git[Task worktrees]
  API --> Notes[Optional Markdown notes]
```

## Data and transactions

SQLite WAL stores versioned JSON records behind a typed store boundary. The initial migration establishes records, migration metadata and message deduplication. Message plus delivery creation is atomic. Plans and nested delegation are atomic to avoid orphaned workers when validation fails. Store changes are debounced into live snapshots. A future relational/PostgreSQL adapter must preserve transaction and uniqueness behavior; no PostgreSQL implementation is claimed.

## Scheduling and lineage

The coordinator submits a bounded DAG; cycle, missing-key, provider and account validation happen before mutation. Every task belongs to a project/repository and one worker. Every child inherits account, project and filesystem permission class. Depth and pool limits include recursive descendants. The scheduler reserves capacity before asynchronous startup, so multiple ticks cannot oversubscribe work. Native read-only sessions reserve their whole potential native-child budget. File-scope conflicts serialize tasks on the same repository even across different projects.

Failed/interrupted tasks remain inspectable; the user can resume them. Dependencies remain blocked until prerequisites finish successfully. Projects can pause scheduling and interrupt work. Five minutes without runtime events generates a stalled event, not an unsafe automatic rerun. This protects against duplicating a still-running side effect.

## Communication

The message envelope records sender, recipient, project, repository, task, type, timestamp, correlation ID, payload and deduplication key. A separate durable delivery record distinguishes queued, delivered, acknowledged and expired states. Delivery uses exponential backoff capped at 60 seconds and a 24-hour TTL. Acknowledgment is recipient-bound. Replays may occur: consumers must use message IDs/deduplication keys, not assume exactly-once processing.

An active worker receives supported `turn/steer` input. Failed/no-active-turn delivery stays queued. A blocked worker is scheduled again when it has a message, and its next turn includes its inbox. A parent cannot finalize successfully while child work or unread child results remain. Already completed unrelated workers are not spontaneously reactivated by arbitrary messages. Native child requests are not impersonated as the parent; unsupported direct access fails and the parent is instructed to bridge communication.

## Git integration

Every coding worker gets `nexus/<task UUID>` and a separate worktree based on repository HEAD. Dependent artifacts are referenced, not silently applied. Change inspection precedes user-requested local commits. Draft-PR creation requires an approval record and uses argument arrays plus a body file. GitHub operations use the user's existing GitHub CLI identity. Default branches are never merged or force-pushed by Nexus.

## Runtime version boundary

The current implementation was verified using generated schemas from `codex app-server generate-ts --experimental`. Its dynamic tool specification uses tagged `type: function` entries, with host `item/tool/call` replies containing `inputText` items and a success flag. Dynamic tools are experimental. The runtime probe creates ephemeral threads without spending inference usage. No undocumented token extraction or auth endpoints are used.

Authentication, model access, sandbox support, login callbacks, actual model tool usage and native children require authenticated integration tests. Catalog discovery is deliberately not presented as a capability guarantee.
