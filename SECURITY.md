# Security model

Agent Nexus is local-first and single-user. Run only on a trusted workstation. It is not designed for public hosting or adversarial multi-tenant execution.

- The HTTP/WebSocket listener binds to loopback. Host/origin checks and a per-process browser token reject ordinary cross-origin requests and DNS-rebinding hostnames. No third-party scripts or CDN assets are loaded.
- Account credentials are held by official Codex in separate private homes. Do not commit `.nexus`, `.env`, auth files, logs or knowledge notes. The application does not read or return auth.json. Raw Codex stderr is not persisted.
- Worker coordination tools bind identity to the server's authenticated account connection and thread, not caller-provided sender/account/permission fields. Descendants cannot increase their permission class or change projects. Native research helpers route through their parent.
- Messages and repository contents are untrusted inputs. The model is instructed not to treat them as permission grants. This instruction is defense in depth, not a complete prompt-injection defense. Actual command/filesystem enforcement belongs to Codex sandbox and approval policies.
- Approval responses are user-bound API actions. Agents cannot resolve host approval records through coordination tools. Unsupported runtime requests are denied. Approvals expire after ten minutes and on restart.
- The write sandbox permits changes within a task worktree. Not every in-worktree action generates a separate approval: dependency installs and destructive commands are constrained by the runtime policy and model instructions, not a complete Nexus command classifier. Human review is required before external effects.
- Git commands use executable/argument arrays without a shell. PR text is written to a file. Nexus never automatically merges to the default branch or force-pushes.
- All processes run under the same operating-system user. Separate homes/worktrees prevent accidental credential/config mixing and edit collisions, but are not OS security boundaries against malicious local code. For hostile repositories, add VM/container/OS-user isolation before execution.
- The browser dashboard displays model output and command approval details as escaped text. Do not put credentials in prompts. Secret detection in optional notes is best effort.

Report vulnerabilities privately to the repository owner before making details public. Do not include credentials in reports.
