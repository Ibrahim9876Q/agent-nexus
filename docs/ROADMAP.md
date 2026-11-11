# Delivery plan and current status

| Phase                  | Delivered                                                                                                              | Remaining                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1 Foundation           | React dashboard, SQLite migration, registry, real app-server handshake/thread creation                                 | Authenticated inference validation                                                                         |
| 2 Multiple accounts    | Independent CODEX_HOME, process and login flow per account; three-process probe                                        | User signs in and verifies three real accounts                                                             |
| 3 Coordination         | Direct durable messaging, acknowledgments, retries, DAG planner tool, concurrency, automatic child-result continuation | Group/topic subscriptions; automatic bounded reassignment; richer planner review                           |
| 4 GitHub               | Worktree isolation, ownership hints, diff summary, local commits, approval-gated draft PR command                      | Repository discovery/cloning UI, issues, CI monitoring, cross-repository dependencies, diff viewer         |
| 5 Delegation/knowledge | Recursive worker delegation; opt-in native research configuration; curated Markdown search                             | Native child tree/control, externally exposed MCP, existing-vault selection, semantic retrieval            |
| 6 Reliability          | Streaming UI, persistence, restart recovery, pause/resume, stalled events, HTTP/WS access guards, tests, CI and docs   | Larger-scale storage pagination, enhanced audit/redaction, stronger OS isolation, interactive graph canvas |

The current release is a usable local MVP, not a claim that all original long-term requirements are complete. Preserve real-vs-mock labeling and expand automated tests with every lifecycle change.
