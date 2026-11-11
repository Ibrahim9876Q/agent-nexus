# Terminal workspace and account admission

The workspace uses black and deep-blue surfaces, a blue/cyan background glow, cyan controls, and a navy-blue composer. Rounded panels and system interface text keep the app readable; locally bundled JetBrains Mono is reserved for code and runtime output. A− and A＋ adjust the interface scale.

Command, Brain, and Agents live only in the sidebar. Its panel button or Ctrl+B opens and closes it. The empty Command screen contains the Nexus mark, “No workspace open,” one workspace/account connection button, and the chat composer. You can draft a prompt before setup; sending requires an open project and a verified account. Existing projects remain available in the sidebar. Live installation still starts empty, with no scripted tasks, invented quota, model usage, or activity.

## Ideas adapted from TeamClaude

We reviewed [TeamClaude](https://github.com/KarpelesLab/teamclaude), particularly its [routing](https://github.com/KarpelesLab/teamclaude/blob/master/docs/routing.md) and [quota](https://github.com/KarpelesLab/teamclaude/blob/master/docs/quota.md) design notes. Useful ideas were account-level admission controls, explicit health/capacity visibility, and avoiding a burst of simultaneous worker starts.

Nexus implements those ideas in its existing scheduler and official Codex app-server adapter. No TeamClaude source was copied and no proxy dependency was introduced. Account identity, credentials and resumable threads stay bound to the original account. Nexus does not pool credentials, transparently rotate requests on quota, intercept TLS, or impersonate another account.

## Capacity and draining

- Verification reads supported `account/rateLimits/read` telemetry. `account/rateLimits/updated` notifications merge sparse windows. A complete refresh can clear absent windows.
- Each window shows the percentage used, provider-reported duration, observation time, and reset time when known. Unknown readings stay unknown; they are never rendered as 0% used.
- Reported exhausted windows with a future or unknown reset stop new admissions for that account. A reported elapsed reset no longer holds the account. Stale observations remain timestamped; the provider remains authoritative.
- **Drain account** stops new assignments without interrupting active work. **Enable new work** lifts that manual gate; authentication, quotas and cooldowns still apply.
- Real Codex task starts on the same account are spaced by at least 750 ms while global and per-account concurrency caps continue to apply.
- Explicit runtime `rateLimitExceeded` failures place the same account into a local 60-second admission cooldown; `serverOverloaded` uses 15 seconds. These are local pacing intervals, not guessed provider reset times. Failed turns are not silently retried or transferred to another account.
- Capacity can be refreshed in account setup. Some authentication/provider modes do not expose quota telemetry; their capacity remains unknown.

## Runtime activity

Agents displays compact Shell, Edit, and Tool rows from app-server item notifications, with status, reported exit code and duration. Started/completed notifications update the same row; the most recent 100 rows persist per task. Model text remains in its separate output stream. Command labels can contain sensitive input, so never put credentials in commands or prompts. Raw shell output is not copied into the activity feed.

The wire-protocol test fixture exercises quota parsing and activity events. Unit/scheduler tests cover sparse updates, unknown capacity, reported reset expiry, throttling and draining while active work finishes. These tests do not substitute for authenticated model integration testing.
