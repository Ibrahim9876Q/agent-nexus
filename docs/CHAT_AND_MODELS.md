# Chat, models, and approvals

## Per-account settings

Open **Workspace & accounts** and find the account. Choose **Model**, **Reasoning effort**, and **Approvals**, then click **Save settings**. Settings persist locally and apply on the next turn, including a resumed turn. They do not change a turn already running; interrupt it if you need it to stop immediately.

**Refresh models** reads the account's official Codex app-server catalog, including paginated and additional entries. Every effort reported for the selected model is available. Model default uses the reported default effort. A catalog entry does not guarantee model entitlement; the provider can still reject unavailable access. Catalog errors remain visible rather than producing an invented list.

| Approval setting | Runtime behavior                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ask for approval | Untrusted execution asks the user; workers keep their assigned sandbox.                                                                                                                            |
| Approve for me   | Codex's automatic reviewer reviews escalations while workers keep their sandbox. Requests still forwarded to the host require a human decision. Unsupported reviewer settings surface as errors.   |
| Full access      | Writable workers use the full-access sandbox and no execution approval prompts. This allows network access and file access outside the worktree. Read-only workers retain their read-only sandbox. |

The setting controls Codex execution. Separate publication/integration operations exposed by Nexus keep their own explicit approval flow. Managed Codex requirements may restrict available profiles. Changing account settings does not grant extra permission to Nexus coordination tools.

## Conversation and delegation

Each workspace supports multiple named chats. Create one with **＋** beside **Chats** and open it from the sidebar. The first prompt supplies its initial title; the pencil control allows a custom name. Draft text stays with its chat while switching. Commands, coordinator threads, planned/delegated tasks, and Nexus messages are scoped to the chat. Cross-chat messages and task dependencies are rejected. The repository, account configuration, capacity limits, and project pause/resume remain shared across the workspace.

Older workspace history is migrated transactionally into one chat. Existing task outputs, Git branches/worktrees and Codex thread identifiers are preserved. Migration does not start AI work.

**Chat** is the default. A message goes to the selected account's coordinator, or the workspace's coordinator when using the automatic destination. The model is instructed to answer greetings, questions, and discussion directly. Repository inspection and delegation are optional and should serve the request. This behavior is model-directed, not a hard-coded greeting/demo response.

Subsequent messages reuse the coordinator's Codex thread and worktree. Each user message has its own saved assistant reply. Messages submitted while the coordinator is running queue for a separate reply after that turn. Earlier replies remain visible when new turns start. **Direct / override** explicitly steers matching workers; **Plan new work** explicitly requests planning. The coordinator waits for planned/delegated work and receives its evidence before completing the final report.

The send button shows animated dots while work is active. A live status line shows thinking, writing, tool activity, queue, approval, and pause states. Partial text is muted while streaming and returns to normal contrast when the turn completes. **Stop** interrupts this chat and cancels queued replies. **Resume / continue** resumes unfinished work in this chat; typing “resume scheduling” or `/resume` also performs that action.

Restart does not start inference by itself. New input resumes restart-held work in its selected chat while leaving other chats held. A deliberate project pause stays paused until explicitly resumed. Request-type coordination messages such as `WORK_REQUEST`, `preview_request`, and `revision_request` wake completed workers. Informational messages do not restart finished work. New continuations send new input and unread coordination messages rather than repeating the entire accumulated user prompt.

## Image messages and usage recovery

Attach images with the composer **＋**, clipboard paste, or drag-and-drop. Thumbnails can be opened or removed before sending. Images remain with their chat and are sent as Codex image inputs, including image-only messages. PNG, JPEG and WebP are supported, up to eight per message and 10 MB each. A model explicitly reporting text-only input is rejected with a useful error.

Workspace setup offers automatic quota resume and account handoff. At 95% reported usage, Nexus saves a stopped worker's files and public context locally; another eligible account can continue in a fresh thread. If no account is ready, it waits for fresh capacity. Stop cancels the wait. [Details and limits](IMAGES_AND_RECOVERY.md).

## Answers, summaries, and usage

Normal answers use readable Markdown. **Working updates** contains the runtime's commentary messages; **Thinking summary** shows the provider's readable reasoning summaries. Both sections start collapsed. Raw reasoning text is not stored or shown. Authoritative completed message items replace streamed drafts, so progress and final text are not concatenated or duplicated.

The response footer reports the number of accounts that actually started work. **Work by account** lists each tracked Nexus task, account, execution model/effort, status, and reported tokens. Multiple-account assignments expand automatically. New task/command lineage preserves attribution through planning and recursive delegation. Usage handoffs also retain the source account attribution and reported tokens.

Token totals come from provider-reported thread usage, subtracting the captured baseline for each turn. Repeated updates replace the same turn's count. Cached input and reasoning output are already included in the provider's total and are not added again. Missing or unattributable usage is explicitly unavailable; partial totals are marked. Native runtime children without separate Nexus task/usage records are not separately itemized. A directive that steers an existing job shows that job's totals, not an invented per-message split.

Old saved messages without phase or usage metadata remain readable. When available, public assistant messages are recovered through Codex's saved turn history and paired with recorded user inputs. Raw reasoning is not imported. If an old reply cannot be recovered, the UI says it was not separately saved. New replies are saved directly with their user message.

## Verification

Protocol-fixture tests cover model pagination and validation, independent account settings, thread reuse, next-turn model/effort overrides, all three approval mappings, public summaries versus raw reasoning, final-message replacement, cumulative usage subtraction, and task/account attribution. The installed-runtime probe creates isolated ephemeral threads for each approval profile without running inference. These checks do not prove authenticated end-to-end behavior for every model or automatic reviewer outcome.

Protocol reference: [official Codex app-server documentation](https://learn.chatgpt.com/docs/app-server).
