# Desktop workspace

After `npm install`, double-click `Launch Nexus.cmd` in the checkout, or run `npm start`. Both build the frontend and open the desktop app. `npm run desktop` is a faster launch when the frontend has already been built.
The live app starts on an empty Command tab. Connect your real Codex accounts, add a Git repository, and click **Connect workspace & accounts** to open setup. Send your first prompt to start a real coordinator task. Opening a workspace never runs inference by itself.

The packaged Windows application is `release-desktop/Agent Nexus 0.2.0.exe`. Node.js 24.13+ must be installed and on PATH; install the official Codex CLI for real account execution. Native Codex discovery searches PATH and standard Windows installations automatically. You can override it with NEXUS_CODEX_BIN.

Command, Brain and Agents are in the sidebar. Use its panel button or Ctrl+B to open and close it. Brain shows project records and Git-observed contributions, including delegation and dependencies. Agents shows real runtime output, errors and messages. Account readiness is refreshed on restart, but completed or interrupted work is not silently rerun.

Left-click the **↗** button beside Command, Brain, or Agents to open that view in its own desktop window. It starts with the same workspace and chat. Arrange the windows with Windows Snap to see them at once. Each window has its own navigation and connects to the same local engine; closing one leaves the others running.

HTTP and HTTPS links in chat open in your default browser, including local previews on another port. A local link still needs a running server at that address.

The sidebar groups work into named chats. **＋** starts a new chat in the selected workspace; the pencil renames it. Each chat has its own coordinator conversations, command history, tasks, and drafts. Existing workspace history migrates into one chat without splitting it by task. Chats share the workspace's repository and account pool. Project pause/resume affects every chat in that workspace.

Account quota windows show provider-reported used percentages side by side, without bars. Missing telemetry stays unknown.

Brain groups each task with its worker, branch, and files in a colored, softly glowing cluster. A shared file or branch appears once and keeps its links to every related task. The repository starts at the center and registered accounts sit around the outside. Hover a node to see its name and highlight its links. **Names & details** lets you jump to a cluster or toggle labels by record type.

Drag a node to move it independently, or drag the surrounding glow (or Shift+drag a node) to move its cluster. Arrow keys move a focused node; Shift+arrow keys move its cluster. Positions and label choices are saved per workspace. **Reset layout** restores the starting arrangement.

Sign-in begins inside the app and completes in the official system-browser flow. Use Sign in, follow the secure link, then Verify. Sign into accounts sequentially. Ready status means authentication exists; a completed task establishes actual inference access. Credentials are isolated per account and never copied from another application.

Adding a new empty project folder initializes Git on `main` and creates an empty initial commit automatically. Empty Git repositories without commits are also prepared, preserving their branch. Existing repositories with commits are left unchanged. Folders with existing files need their own initial Git commit before import. If no Git identity is configured, new empty repositories receive a repository-local `Agent Nexus <agent-nexus@localhost>` identity; global Git configuration is never changed. Preparation happens only when you add the chosen folder in Nexus.

Chat is the default mode: one coordinator answers naturally and can plan or delegate when useful. Every message retains its own reply; additional messages during a turn queue for their own reply. Direct / override explicitly steers matching workers. The live status line and animated send-button dots show actual running/queued work; pause and approval waits are distinguished. Stop interrupts this chat, and Resume / continue reactivates unfinished work. A new message can resume restart-held work in its chat without releasing other chats. Each account's model, reasoning effort, and approval profile applies on its next turn. See [chat and model controls](CHAT_AND_MODELS.md).

Live source data is `.nexus/live/`; packaged live data is `workspace-live/` under the OS application-data directory. Existing legacy demo data is preserved in its old location and is not loaded. The renderer has no Node integration and uses a loopback-only backend. The desktop bridge validates requests to pick a folder, open a browser link, or pop out a Nexus view.

## Mock installation

For optional scripted testing, run `npm run mock:desktop`. It opens an isolated app instance with a MOCK INSTALLATION banner, mock-only account setup, and a Run three-account simulation button. Its data is `.nexus/mock-installation/`. You can also run `npm run mock:demo` from the terminal.

Mock workers and the simulation API are disabled in the live app. Automated RPC fixture tests are explicitly labeled and are not used for real execution.

## Build

Run `npm run desktop:build` to prepare the backend runtime and portable Windows executable. The runtime does not bundle credentials. The EXE is unsigned and still needs installed Node.js and Codex.
