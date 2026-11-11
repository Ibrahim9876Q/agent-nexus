# Desktop workspace

Double-click `Launch Nexus.cmd` in the checkout, or run `npm run desktop`.
The packaged Windows application is `release-desktop/Agent Nexus 0.2.0.exe`.
Node.js 24+ must be installed and on PATH; install the official Codex CLI for real account execution.

The app opens Command first, followed by Brain and Agents. The gear button opens account/repository/project setup. Add any number of independently authenticated accounts; complete each official sign-in in your system browser and return to Verify. This avoids collecting passwords or embedding an authentication webview.

Command supports account-targeted or project-wide directives, plans, project pause and scheduling resume. Active turns receive supported steering. Idle tasks queue continuation. A dispatch receipt records each worker's outcome; it does not claim that queued work was already processed. Pause and resume apply to the entire selected project. Interrupted tasks require explicit resume from Agents.

Brain is an interactive force graph of actual project records: repositories, accounts, workers, tasks, delegation, prerequisites, communication, and worktree branches. File nodes show declared task scopes and observed Git changes relative to the repository's current HEAD, including untracked files. Branch links are contributions, not evidence a PR was merged. Click a worker node to inspect it and open its stream. Pan the empty canvas, scroll to zoom, or use the controls.

Agents shows each worker's assignment, branch, worktree, streamed text and messages. Codex must be signed in and a real task started before real inference output appears. Mock tasks remain explicitly identified.

The desktop renderer has no Node integration; it talks to a loopback-only backend started by the app. Closing the window stops its backend, and interrupted work is recovered explicitly on restart. Packaged state is under the OS application data directory; development mode uses the checkout's `.nexus` directory. The EXE is unsigned. No public hosting or GitHub publication is needed.

Build with `npm run desktop:build`. This prepares a minimal backend runtime and a portable Electron executable. The runtime depends on installed Node.js 24+ and does not bundle account credentials.
