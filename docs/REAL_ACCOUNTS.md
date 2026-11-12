# Real-account integration procedure

This is intentionally separate from mock CI. Run locally with accounts you own and explicitly authorize. The procedure consumes their normal Codex usage.

1. Run `npm run check:codex`. All three probe processes should initialize, read account state and create ephemeral threads with coordination tools. These fresh probe homes should be signed out.
2. Start Nexus and add Account A, Account B and Account C as Codex accounts. Sign in through the official browser flow **sequentially**, checking the intended identity each time. No passwords or tokens are entered into Nexus.
3. Verify each account. Confirm their `.nexus/accounts/<id>` directories differ, without opening or copying `auth.json`. Restart Nexus and verify again; existing credentials should remain independent.
4. Add a disposable Git repository with an initial commit. Create a small greeting-app project under Account A. Ask the coordinator to plan separate backend and frontend tasks, have the frontend negotiate an API contract through messages, and schedule independent review after both tasks.
5. Inspect the plan. Assign test tasks explicitly if the coordinator's plan is unsuitable. Verify B and C operate in different worktrees and their output streams into Task board.
6. In a worker task, request: “Use nexus_delegate for a focused review helper. The helper may delegate one further read-only investigation if useful. Wait for results and acknowledge all messages.” Verify lineage, depth, inherited account and worker-delegation labels. A writable parent may write; do not use untrusted repositories for this test.
7. Verify a `NEED_DEPENDENCY` message is delivered and acknowledged, with a correlated contract reply and readiness message. Pause the recipient, send a new message and verify it remains queued. Resume scheduling and explicitly resume the interrupted task; the inbox should arrive on continuation.
8. Test native subagents separately: configure one native research helper and at least two execution slots. Add a read-only research task asking for a native subagent. Verify native activity and that the parent relays external messages. This does not verify direct native-child addressing; Nexus does not claim that capability.
9. Trigger a benign operation requiring Codex approval. Confirm the dashboard shows the exact command/file request. Decline it and verify nothing is silently approved. Unsupported permission request types must fail closed.
10. Stop Nexus during work. Restart; verify the task is interrupted, not rerun automatically. Inspect its worktree and resume; the same saved thread should continue.
11. Inspect diffs, run the repository's tests independently, and have a different worker review. Commit locally. If desired, request a draft PR and approve only after reviewing destination/branch details. Confirm the default branch remains unchanged.
12. Repeat on two separate repositories concurrently. Attempt a message or task dependency across project IDs and verify rejection. Explicit cross-repository links are not yet implemented.

Record runtime version, account plan labels (not credentials), task IDs, message delivery states, test commands and outcomes. Rate limits must surface as a checkpoint/wait state. Test usage recovery only with separately authorized accounts and their own limits: wait for the source turn to stop, confirm the destination uses a fresh thread and the same worktree, and verify Stop cancels recovery. Never copy authentication or opaque provider thread state. Quota transitions can be tested through the protocol fixture without deliberately exhausting real subscriptions.

Known integration considerations: Codex's Windows sandbox may require initial setup; auth browser callbacks can conflict if launched simultaneously; popup blockers may require opening the provided official login link; dynamic tool schemas can change with runtime releases. API-key workers require separate billing and their own explicit setup.
