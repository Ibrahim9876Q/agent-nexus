# Agent Nexus

**One command center for your coding agents.**

Agent Nexus is a local desktop workspace for coordinating independently authenticated Codex accounts. Give your team an objective, direct individual workers, and follow their tasks, messages, Git branches, and file contributions in one place.

Built with Electron, React, TypeScript, SQLite, and the official Codex app-server.

> **Early MVP — Windows first.** The automated simulation, scheduler, messaging, and Git workflows are tested. Three isolated Codex processes and coordination-tool registration have been verified. Full multi-account inference still needs validation after you sign in on your own machine. Native UI verification was limited by automation permissions during development.

[Quick start](#quick-start-on-a-windows-laptop) · [Live workspace](#first-launch-an-empty-real-workspace) · [Connect accounts](#connect-your-real-accounts) · [Mock installation](#mock-installation) · [Troubleshooting](#troubleshooting)

## The workspace

| Tab              | What you do there                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **01 / Command** | Send master prompts, select one account or all project workers, create plans, and pause or resume scheduling. Opens first.                              |
| **02 / Brain**   | Explore a graph of repositories, accounts, agents, tasks, dependencies, messages, branches, and file changes. Click nodes to inspect their connections. |
| **03 / Agents**  | Inspect each worker's assignment, status, branch, worktree, streamed output, and messages. Interrupt or resume individual tasks.                        |

The gear button opens **Workspace setup**, where you add accounts, local repositories, and projects. You can start with one account and add two, three, or more; configured concurrency limits still apply.

## Quick start on a Windows laptop

### 1. Install the prerequisites

- **Node.js 24.13 or newer**, including npm: [Node.js downloads](https://nodejs.org/en/download).
- **Git for Windows**: [Git installation](https://git-scm.com/install/windows).
- **GitHub CLI**, to authenticate and clone this private repository: [GitHub CLI](https://cli.github.com/).
- **Codex CLI** for real agent execution. You can test the simulation before installing or signing into Codex.

Open a **new PowerShell window** after installation and check:

```powershell
node --version
npm.cmd --version
git --version
gh --version
```

The examples use `npm.cmd` so PowerShell does not need to run the `npm.ps1` wrapper.

### 2. Sign into GitHub and clone

```powershell
gh auth login
```

Select GitHub.com and complete its browser sign-in with the account that has access to `Ibrahim9876Q/agent-nexus`. Then:

```powershell
cd "$env:USERPROFILE\Documents"
gh repo clone Ibrahim9876Q/agent-nexus
cd agent-nexus
```

**This repository is private.** Another GitHub account needs access before it can clone it. Your GitHub login is separate from the ChatGPT accounts you will connect inside Nexus.

### 3. Install, build, and launch

Run from the `agent-nexus` directory:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run desktop
```

The first launch may download Electron. Keep the terminal open while testing. A separate **Agent Nexus** application window should open on the **Command** tab.

After the first successful setup, launch again with:

```powershell
cd "$env:USERPROFILE\Documents\agent-nexus"
npm.cmd run desktop
```

You can also double-click **Launch Nexus.cmd** in the checkout after dependencies and the frontend have been built.

## First launch: an empty, real workspace

`npm.cmd run desktop` opens the live application. It contains no sample accounts, greeting project, scripted tasks, or prefilled chat. The simulation endpoint and mock accounts are disabled in this mode.

1. Open the gear and connect your real Codex accounts as described below.
2. Add a local Git repository and open its project workspace.
3. Send your first prompt in **Command**. Opening a project does not start any AI work by itself.
4. Follow actual runtime output in **Agents** and contributions in **Brain**.

Old sample data is preserved in its previous location and is not loaded by the live app. Fresh source installations use `.nexus/live`; the optional mock installation uses `.nexus/mock-installation`.

## Mock installation

This is a separate, optional developer test environment. It is not part of normal setup and cannot supply scripted results to the live app.

```powershell
npm.cmd run mock:desktop
```

This opens a separate app instance with a **MOCK INSTALLATION** banner and its own database.

1. Launch the mock installation above and click the **gear** in the lower-left ribbon.
2. Click **Run three-account simulation** at the bottom of Workspace setup.
3. The generated project becomes selected. Open **Agents** to follow its tasks.
4. Open **Brain** to inspect account ownership, delegated workers, dependencies, worktree branches, and changed files.
5. Click a worker node and choose **Open worker stream** to inspect its output.

The simulation creates three mock accounts and a disposable local Git repository. A backend worker and frontend worker negotiate an API contract. The backend requests a review helper. An integration worker combines their commits on a separate branch and runs a real Node integration test; the coordinator writes a summary.

**Expected result:** five tasks complete, a delegated helper appears, messages are acknowledged, and the generated repository's original `main` branch remains unchanged. These workers are explicitly labeled `mock` / `simulation`; they do not consume Codex usage or publish anything to GitHub.

For terminal-only verification:

```powershell
npm.cmd test
npm.cmd run mock:demo
```

The automated tests cover live/mock isolation, empty startup, opening a workspace without starting tasks, native executable discovery, subprocess RPC, command targeting, delegation, message retries, recovery, Git contributions, and concurrent repositories. The subprocess test uses an explicitly labeled protocol fixture; it does not claim an authenticated model inference succeeded.

## Connect your real accounts

### Install and locate Codex

Install the official CLI using the [OpenAI Codex CLI instructions](https://learn.chatgpt.com/docs/codex/cli):

```powershell
npm.cmd install -g @openai/codex
codex --version
```

Nexus starts the **native Codex executable** directly and automatically searches PATH, the installed Codex desktop binary directory, and the standard Windows npm installation. If automatic discovery fails, locate the executable and pass its path in the same PowerShell window:

```powershell
# Prefer a native executable already on PATH.
$codexNative = Get-Command codex.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty Source

# Otherwise look inside the official npm installation.
if (-not $codexNative) {
    $openaiPackages = Join-Path (npm.cmd root -g) '@openai'
    $codexNative = Get-ChildItem -LiteralPath $openaiPackages -Filter codex.exe -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}

if (-not $codexNative) {
    throw 'Native codex.exe was not found. Check your official Codex installation.'
}

$env:NEXUS_CODEX_BIN = $codexNative
npm.cmd run check:codex
npm.cmd run desktop
```

The probe initializes three separate app-server processes and registers coordination tools without signing in or running inference. Signed-out probe accounts are expected. It is a compatibility check, not proof of model entitlement.

The environment variable above applies to that terminal and applications launched from it. Repeat it in a new terminal when needed. The desktop launcher **does not automatically load `.env`**; the optional browser/server launch does. If using a different official installation layout, set `$env:NEXUS_CODEX_BIN` to its full `codex.exe` path explicitly.

### Sign in from the app

1. Open the **gear → Workspace setup**.
2. Under **01 / Accounts**, enter a recognizable name such as `Architecture`, select **Codex / ChatGPT**, and click **Add account**.
3. Click **Sign in** for that account.
4. Click **Open secure ChatGPT sign-in**. Complete the official flow in your system browser using the intended account.
5. Return to Nexus and click **Verify**. The account should show `ready`.
6. Repeat for your second and third accounts, **one sign-in at a time**.

Nexus does not copy this machine's existing ChatGPT desktop login or your other laptop's credentials. Each laptop needs its own sign-ins. Each account has an isolated Codex home and process. Credentials remain on that machine; included plan usage and limits remain separate. An API key is not required for the intended ChatGPT sign-in workflow.

## Create your first real project

Use a small test repository for your first run. Nexus needs a local Git repository with at least one commit and a configured Git commit identity.

For example, from PowerShell:

```powershell
cd "$env:USERPROFILE\Documents"
mkdir nexus-test-project
cd nexus-test-project
git init -b main
'# Nexus test project' | Set-Content README.md
git add README.md
git commit -m "Initial test repository"
```

If Git asks who you are, set your identity **inside this test repository**, using your own name and email, then retry the commit:

```powershell
git config user.name "Your Name"
git config user.email "your-email@example.com"
git commit -m "Initial test repository"
```

In Nexus, open **Workspace setup**:

1. Under **02 / Repository**, enter a name and the full local path, such as `C:\Users\YourName\Documents\nexus-test-project`. Click **Add local repo**.
2. Under **03 / Project**, enter a project name, select that repository and a verified coordinator account, and enter an objective.
3. Click **Open project workspace**. The workspace stays idle until you send a prompt from Command.

Suggested first prompt in Command:

```text
Build a tiny greeting application using plain JavaScript and Node's built-in
modules. Use separate backend and frontend workers on different connected
Codex accounts, with an independent testing/review worker. Negotiate the API
contract through Nexus messages. Use a delegated helper for a focused review
if useful. Run the tests and summarize the evidence. Keep the scope small;
do not install dependencies, push, or merge without my approval.
```

Open **Agents** to see whether real output starts. Check approval requests if a worker pauses. The coordinator chooses assignments through Nexus tools; verify its plan rather than assuming every connected account must run on every request.

## Use the workspace

### Command: direct your team

Select the project in the left sidebar. Enter a prompt, select its destination and mode, then click **Send directive** or press **Ctrl + Enter**.

| Mode                  | Behavior                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Direct / override** | Sends a directive to existing workers in the selected project. Active turns receive steering; idle tasks queue continuation. With no matching workers, Nexus attempts to create a coordinator. |
| **Plan new work**     | Creates a coordinator planning task under the selected account, or a ready Codex account when using the all-workers destination.                                                               |
| **Pause project**     | Pauses scheduling and interrupts active turns for the whole selected project.                                                                                                                  |
| **Resume scheduling** | Reactivates project scheduling. Interrupted tasks still require explicit resume in Agents.                                                                                                     |

Examples:

```text
Review the current work, identify blockers, and report what remains.
```

```text
Keep the API contract stable. Focus on tests before adding more features.
```

Choose one account to address its project workers, or **All project workers** to direct the whole project's team. Read the dispatch receipt: accepted, queued, and failed delivery are different outcomes. Directives arriving during worker startup are queued and steered into its turn after it starts.

### Brain: inspect connections and contributions

- Drag the empty canvas to pan; scroll or use **+ / −** to zoom.
- Click a node to see its details and relationships.
- Follow agent → task → branch links to understand ownership and contributions.
- File nodes distinguish declared scopes from Git-observed changes relative to the repository's current HEAD, including untracked files.
- Select an agent and click **Open worker stream** to jump to Agents.

The graph grows from real workspace records. A branch contribution does not mean a change was merged or a pull request exists.

### Agents: follow individual work

Select a worker to inspect its assignment, status, branch, isolated worktree, streamed text, and communication. Use **Interrupt** for running tasks and **Resume task** for blocked, failed, or interrupted tasks after inspection.

The stream shows output exposed by the Codex runtime, not private model reasoning. Worker-level children have their own thread and worktree, inherit the parent's permissions, and can request further children within depth and pool limits.

### Approvals and review

When an approval request appears, review its exact details before approving or declining. Independently inspect changes and test results before integration. Nexus does not automatically merge or force-push your default branch.

## Launch options and commands

| Command                     | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `npm.cmd ci`                | Install the locked dependencies on a fresh checkout.           |
| `npm.cmd run build`         | Check TypeScript and build the desktop frontend.               |
| `npm.cmd run desktop`       | Open the native desktop window and start its local backend.    |
| `npm.cmd test`              | Run automated mock, scheduler, HTTP, and Git tests.            |
| `npm.cmd run demo`          | Run the three-account simulation and print evidence as JSON.   |
| `npm.cmd run check:codex`   | Probe three isolated real runtime processes without inference. |
| `npm.cmd run desktop:build` | Build a portable Windows executable under `release-desktop/`.  |
| `npm.cmd start`             | Optional browser mode at `http://127.0.0.1:4310`.              |

### Build an executable on your laptop

```powershell
npm.cmd run desktop:build
```

Output: **`release-desktop/Agent Nexus 0.2.0.exe`**.

The EXE still requires installed **Node.js 24.13+** and, for real workers, the native Codex CLI. It is unsigned. Generated binaries are ignored by Git and are **not included in a repository clone**; build one locally. Do not assume a GitHub release download is available.

## Updating and local data

Close Nexus before updating. From its checkout:

```powershell
git pull --ff-only
npm.cmd ci
npm.cmd run build
npm.cmd run desktop
```

| Launch mode                         | Private workspace state                                               |
| ----------------------------------- | --------------------------------------------------------------------- |
| Source launcher / `npm run desktop` | `.nexus/live/` inside your checkout.                                  |
| Mock source launcher                | `.nexus/mock-installation/` inside your checkout.                     |
| Packaged EXE                        | Electron's per-user application-data folder, under `workspace-live/`. |
| Browser/server mode                 | `.nexus/live/` by default; configurable through `NEXUS_DATA_DIR`.     |

These locations contain the database, account homes, conversations, worktrees, simulation repositories, and optional notes. Source and packaged launches use separate workspace locations. A fresh packaged app can therefore look empty even if you tested from source.

Do not copy credentials into your Git repository. Moving between laptops requires installing prerequisites, cloning/building Nexus, cloning your project repositories, and signing in again. Close the app before backing up private workspace state. Worktrees reference their original repository paths, so copying only `.nexus` is not a complete portable project migration.

## Troubleshooting

| Symptom                                        | What to check                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `node`, `git`, or `gh` is not recognized       | Install the prerequisite, then open a new terminal so PATH updates apply.                                                                       |
| PowerShell blocks an npm script wrapper        | Use `npm.cmd`, as shown above.                                                                                                                  |
| GitHub says repository not found               | It is private. Check `gh auth status` and use an authorized GitHub account.                                                                     |
| Desktop opens blank or assets are missing      | Run `npm.cmd run build` before `npm.cmd run desktop`.                                                                                           |
| Startup timeout / backend stopped              | Check `node --version` is at least 24.13 and launch from the checkout terminal.                                                                 |
| Codex disconnects, cannot spawn, or times out  | Set `NEXUS_CODEX_BIN` to a native `codex.exe`, then run the runtime probe. A working `codex` shell wrapper alone is insufficient.               |
| Verify says signed out                         | Complete the account-specific browser flow, then Verify. Sign into accounts sequentially.                                                       |
| Windows sandbox setup blocks execution         | Follow the [official Codex Windows sandbox instructions](https://learn.chatgpt.com/docs/windows/windows-sandbox) before testing writable tasks. |
| Tasks wait indefinitely                        | Check account readiness, approvals, project pause state, prerequisite completion, concurrency, and worker errors.                               |
| Project resumed but a task remains interrupted | Open Agents, inspect it, and click **Resume task**.                                                                                             |
| Git worktree creation fails                    | Select the repository root, ensure HEAD exists, and check local filesystem permissions.                                                         |
| SQLite experimental warning                    | Node's built-in SQLite currently emits this warning; it alone does not indicate an application failure.                                         |
| Data looks different between launch methods    | Source and packaged app state are stored separately; see the table above.                                                                       |

When reporting an issue, include Node/Codex versions, launch method, the failed step, and sanitized error text. Do not include auth files, tokens, or private task content.

## Current scope

**Implemented:** desktop navigation, central directives, account isolation and login initiation, streamed worker output, recursive worker delegation, durable direct messaging, dependency scheduling, Git worktrees, interactive contribution graph, persistent state, restart recovery, and mock acceptance tests.

**Still needs real-account validation:** authenticated multi-account inference, native Codex child-agent execution, Windows sandbox behavior on your machine, and remote draft-PR publication.

**Current boundaries:** dynamic coordination tools use an experimental app-server interface; dependencies schedule work but do not automatically merge branches; the desktop does not yet expose every backend operation (such as PR publication, knowledge management, or detailed native-agent settings). Group/topic subscriptions, cross-project dependency links, automatic failed-task reassignment, and deeper GitHub/CI integration remain follow-up work. The graph and workspace are single-user features, not security boundaries for hostile repositories.

See [security](SECURITY.md), [desktop behavior](docs/DESKTOP.md), [architecture](docs/ARCHITECTURE.md), and the [roadmap](docs/ROADMAP.md). Older phase documents may describe backend functionality that is not exposed in the current desktop UI.

## Project structure

```text
desktop/       Electron window and application lifecycle
web/           React Command, Brain, and Agents interface
src/           Local server, scheduler, message bus, and Codex adapter
src/db/        SQLite store and migration
src/integrations/  Git worktrees and optional Markdown knowledge
scripts/       Simulation, runtime probe, and desktop packaging
tests/         Automated behavior and integration tests
docs/          Architecture, desktop details, and test procedures
```

GitHub Actions runs the source build, formatting/type checks, and mock tests on Windows and Linux. The portable desktop build targets Windows; macOS/Linux desktop distribution is not yet validated. CI does not use your ChatGPT login.

## License

[MIT](LICENSE). Independent project; not affiliated with OpenAI or Obsidian.
