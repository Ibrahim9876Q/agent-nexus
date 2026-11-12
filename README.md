# Agent Nexus

Agent Nexus lets multiple Codex accounts work together on a coding project from one desktop app.

## Quick start

Install [Node.js 24.13 or newer](https://nodejs.org/en/download) and [Git](https://git-scm.com/install/windows), then run:

```sh
git clone https://github.com/Ibrahim9876Q/agent-nexus.git
cd agent-nexus
npm install
npm start
```

`npm start` builds the interface and opens the Windows desktop app. No GitHub login or GitHub CLI is needed. Already downloaded the project? Open a terminal in its folder and run just `npm install`, then `npm start`.

On Windows PowerShell, use `npm.cmd install` and `npm.cmd start` if PowerShell blocks `npm`. After setup, use `npm start` or double-click **Launch Nexus.cmd** to open it again.

## Connect accounts and start working

To run real agents, install the official Codex CLI once:

```sh
npm install -g @openai/codex
```

1. In Nexus, click **Connect workspace & accounts**.
2. Enter an **Account email**, click **Add account**, then **Sign in**. Open or copy the secure sign-in link, finish signing in, and click **Verify**. Repeat for your other accounts.
3. Under **Project folder**, choose an existing Git repository or a new empty folder and click **Add folder**. Nexus sets up Git and the first commit for empty folders automatically. Then create and open its project workspace.
4. Type your prompt in **Command** and send it. Use **Brain** to see connections and **Agents** to follow individual workers. Toggle the sidebar with **Ctrl+B**.

Use **＋** next to **Chats** to start another conversation in the same workspace. Each sidebar entry opens one chat; its worker tasks stay inside that chat. Hover a chat and click the pencil to rename it. Account usage is shown as two percentages, side by side.

In **Brain**, use **Names & details** to toggle names for each node type. The repository starts in the center and accounts sit around it. Drag any bubble to move it, drag the background to pan, and scroll to zoom. Label choices and node positions are saved for that workspace.

The app starts empty. Opening a workspace does not start AI work until you send a prompt. Account sign-in happens through the official browser flow.

In **Workspace & accounts**, each account has **Model**, **Reasoning effort**, and **Approvals** controls. Click **Save settings** to apply them to its next turn. Normal chat uses one coordinator and brings in other accounts when useful. Replies include collapsible thinking summaries and a work/usage footer. See [chat and model controls](docs/CHAT_AND_MODELS.md).

Use **＋** in the composer to attach PNG, JPEG, or WebP images, or paste/drop them into the chat (up to 8 images, 10 MB each). Nexus sends your text and images to the selected Codex model.

**Usage recovery** is enabled in workspace setup. At 95% reported usage, Nexus stops the turn, saves a local Git checkpoint and chat context, and continues with another available connected account. If none is available, it checks capacity once a minute and resumes when the provider reports capacity again. Keep Nexus running; Stop and manual pauses prevent automatic continuation. Checkpoints stay on your computer. See [images and recovery](docs/IMAGES_AND_RECOVERY.md).

## Mock installation

For optional testing with scripted workers, after the first build:

```sh
npm run mock:desktop
```

Open **Workspace & accounts** and click **Run three-account simulation**. Mock data stays separate from the real app.

## Other commands

| Command                 | What it does                                   |
| ----------------------- | ---------------------------------------------- |
| `npm start`             | Build and open the desktop app.                |
| `npm test`              | Run automated tests.                           |
| `npm run lint`          | Check formatting and TypeScript.               |
| `npm run desktop:build` | Build `release-desktop/Agent Nexus 0.2.0.exe`. |
| `npm run server`        | Start the optional browser/server mode.        |

The executable still requires installed Node.js and Codex. Generated executables are not included in a repository clone.

## Details

This is an early Windows-first app. Automated workflows and isolated Codex process setup are tested; authenticated multi-account execution still needs real-account validation.

[Usage and troubleshooting](docs/USAGE.md) · [Desktop behavior](docs/DESKTOP.md) · [Architecture](docs/ARCHITECTURE.md) · [Account capacity](docs/DESIGN_AND_CAPACITY.md) · [Security](SECURITY.md)

[MIT license](LICENSE). Independent project; not affiliated with OpenAI or Obsidian.
