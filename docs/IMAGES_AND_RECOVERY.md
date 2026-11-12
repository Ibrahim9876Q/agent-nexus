# Images and usage recovery

## Attach an image

Open a workspace and chat. Click **＋** beside the composer, paste an image from the clipboard, or drop image files onto the composer. You can attach up to eight PNG, JPEG, or WebP files per message, each no larger than 10 MB. Click a thumbnail to enlarge it; use its × to remove it before sending. Text is optional for image messages.

Nexus sends text plus official Codex `localImage` inputs to the account's selected model. The model must support images and be available to that account. Images live in the installation's local `attachments` folder; metadata and chat IDs live in SQLite. Image downloads require the local session token. Base64 image bodies are not broadcast in state snapshots.

## Continue when usage runs low

In **Workspace & accounts → Usage recovery**, two settings are enabled by default:

- **Save at 95% usage and resume when capacity returns** watches both provider-reported usage windows and handles explicit usage/rate-limit errors.
- **Continue with another available account** allows a different connected account to take over saved work. Turn this off to wait for the original account instead.

When either reported window reaches 95%, Nexus requests an interruption. It waits for the provider to confirm that the turn ended before saving or transferring ownership. A turn that completes naturally finishes normally. At a hard limit, the unfinished task enters the same recovery path.

The saved checkpoint contains a private Git revision of tracked and nonignored working files plus a public-context manifest: chat messages and replies, current request, task reports, dependencies, queued coordination messages, working paths, and attachment references. It uses a separate Git index, so your staged files, branch and working tree remain intact. Ignored files stay in the existing worktree. Checkpoints are local, under the installation's `handoffs/<id>/context.json`; nothing is uploaded to GitHub or a cloud service.

A destination account must be signed in, enabled, below the reserve if usage is known, outside cooldown, within its agent limit, and compatible with attached images. Normal concurrency and scope checks still apply. Nexus keeps the logical task/worker identity so dependencies and messages continue to work, but starts a fresh Codex thread in the same worktree. It supplies the manifest path and an instruction to inspect current files and continue without repeating completed work. The stricter approval profile and existing filesystem permission class carry forward. Source credentials, opaque provider thread state and private reasoning are never transferred.

If no account is available, the task visibly waits. Nexus polls reported capacity about once a minute and resumes when a fresh reading shows headroom. A reset time alone is not sufficient; unavailable telemetry remains unknown. Rate-limit errors also impose at least a one-minute cooldown to avoid rapid retries. Failed checkpoint writes hold the task and retry once a minute without losing its working files.

Keep Nexus running for automatic recovery. **Stop**, a deliberate workspace pause, account draining, and restart holds prevent automatic execution. Reopening Nexus holds unfinished work until you resume its chat. Turning automatic resume off cancels outstanding recovery waits; you can inspect and explicitly resume the task later. Other model/tool/authentication errors require normal troubleshooting.

## What is verified

Automated tests cover authenticated upload/download, attachment/chat isolation, image-only Codex protocol inputs, format rejection, preserving the Git index and working files, interruption before handoff, fresh threads under separate accounts, capped approvals, capacity recovery, source usage attribution, and cancellation by Stop/pause. These use real Git worktrees and deterministic app-server protocol fixtures, without spending subscriptions to force a quota limit. They do not prove every model's image access or the exact timing of live provider quota updates; a provider may jump past 95% between reports.
