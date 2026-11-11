import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  Account,
  Agent,
  Task,
  Project,
  Repo,
  Message,
  Approval,
  Tables,
} from '../src/types';
import { Brain } from './brain';
import './workspace.css';
export type State = {
  installation: 'live' | 'mock';
  accounts: Account[];
  agents: Agent[];
  tasks: Task[];
  projects: Project[];
  repos: Repo[];
  messages: Message[];
  approvals: Approval[];
  commands: Tables['commands'][];
};
let token = '';
export async function api(path: string, body?: unknown) {
  const r = await fetch('/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexus-Token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error || 'Request failed');
  return v;
}
function App() {
  const [s, setS] = useState<State>(),
    [tab, setTab] = useState('Command'),
    [project, setProject] = useState(''),
    [target, setTarget] = useState('all'),
    [prompt, setPrompt] = useState(''),
    [mode, setMode] = useState('direct'),
    [error, setError] = useState(''),
    [connected, setConnected] = useState(false),
    [settings, setSettings] = useState(false),
    [auth, setAuth] = useState(''),
    [selected, setSelected] = useState(''),
    [repoPath, setRepoPath] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let dead = false,
      ws: WebSocket,
      timer: ReturnType<typeof setTimeout>;
    async function connect() {
      try {
        token = (await (await fetch('/api/session')).json()).token;
        const v = await api('/state');
        if (dead) return;
        setS(v);
        ws = new WebSocket(`ws://${location.host}/live?token=${token}`);
        ws.onopen = () => setConnected(true);
        ws.onmessage = (e) => setS(JSON.parse(e.data));
        ws.onclose = () => {
          setConnected(false);
          if (!dead) timer = setTimeout(connect, 1500);
        };
      } catch (e) {
        if (!dead) {
          setError(String(e));
          timer = setTimeout(connect, 2000);
        }
      }
    }
    void connect();
    return () => {
      dead = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, []);
  async function act(fn: () => Promise<unknown>) {
    setError('');
    try {
      const result = await fn();
      setS(await api('/state'));
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  if (!s)
    return (
      <div className="boot">
        [ nexus ]<p>initializing local workspace…</p>
        {error}
      </div>
    );
  const tasks = s.tasks.filter((t) => t.projectId === project),
    agents = s.agents.filter((a) => a.projectId === project),
    commands = s.commands.filter((c) => c.projectId === project),
    visibleTasks = tasks.filter(
      (t) =>
        target === 'all' ||
        s.agents.find((a) => a.id === t.agentId)?.accountId === target,
    ),
    activeTask =
      visibleTasks.find((t) => t.agentId === selected) || visibleTasks[0];
  const ready = s.accounts.some((a) => a.status === 'ready');
  const form = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.currentTarget));
  };
  async function send() {
    if (!prompt.trim() || !project || !ready) return;
    setBusy(true);
    try {
      await act(() =>
        api('/command', {
          projectId: project,
          text: prompt,
          mode,
          ...(target !== 'all' ? { accountId: target } : {}),
        }),
      );
      setPrompt('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="desktop">
      <aside className="ribbon">
        <span className="mark">N</span>
        <button title="Command" onClick={() => setTab('Command')}>
          ⌘
        </button>
        <button title="Brain" onClick={() => setTab('Brain')}>
          ⠿
        </button>
        <button title="Agents" onClick={() => setTab('Agents')}>
          ▤
        </button>
        <button
          className="ribbon-settings"
          title="Accounts and workspace"
          onClick={() => setSettings(!settings)}
        >
          ⚙
        </button>
      </aside>
      <aside className="explorer">
        <div className="workspace-name">
          nexus workspace{' '}
          <button title="Setup" onClick={() => setSettings(!settings)}>
            ＋
          </button>
        </div>
        <div className="explorer-label">PROJECTS</div>
        <select
          aria-label="Project"
          value={project}
          onChange={(e) => {
            setProject(e.target.value);
            setSelected('');
          }}
        >
          <option value="">Select a project</option>
          {s.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="file-tree">
          <div>⌄ &nbsp; github workspace</div>
          {s.repos
            .filter((r) =>
              s.projects.some((p) => p.id === project && p.repoId === r.id),
            )
            .map((r) => (
              <span key={r.id}>◇ &nbsp; {r.name}</span>
            ))}
          <div>
            ⌄ &nbsp; connected accounts <small>{s.accounts.length}</small>
          </div>
          {s.accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setTarget(a.id);
                setTab('Agents');
              }}
            >
              <i className={a.status === 'ready' ? 'ready' : ''} />
              {a.name}
              <small>{a.provider}</small>
            </button>
          ))}
          <button className="add-account" onClick={() => setSettings(true)}>
            ＋ Connect account
          </button>
        </div>
        <div className="explorer-label">TASKS / {tasks.length}</div>
        <div className="task-tree">
          {tasks.map((t) => (
            <button
              key={t.id}
              className={activeTask?.id === t.id ? 'chosen' : ''}
              onClick={() => {
                setSelected(t.agentId);
                setTab('Agents');
              }}
            >
              <span className={t.status}>●</span>
              {t.title}
            </button>
          ))}
        </div>
        <div className="explorer-bottom">
          LOCAL FIRST
          <br />
          <span>Independent accounts. Shared direction.</span>
        </div>
      </aside>
      <section className="surface">
        {s.installation === 'mock' && (
          <div className="mock-banner">
            MOCK INSTALLATION · Scripted workers only · Separate test data
          </div>
        )}
        <div className="tabbar">
          {['Command', 'Brain', 'Agents'].map((name, i) => (
            <button
              key={name}
              className={tab === name ? 'selected' : ''}
              onClick={() => setTab(name)}
            >
              <span>{['⌘', '⠿', '▤'][i]}</span>
              {name}
              <small>0{i + 1}</small>
            </button>
          ))}
          <span className="tabbar-end">agent nexus</span>
        </div>
        <div className="breadcrumb">
          workspace /{' '}
          {s.projects.find((p) => p.id === project)?.name || 'getting started'}{' '}
          / <span>{tab.toLowerCase()}</span>
          <span className="connection">
            <i className={connected ? 'ready' : ''} />
            {connected ? 'local engine connected' : 'reconnecting'}
          </span>
        </div>
        {error && (
          <div className="error">
            {error}
            <button onClick={() => setError('')}>×</button>
          </div>
        )}
        {s.approvals
          .filter((a) => a.status === 'pending')
          .map((a) => (
            <div className="approval" key={a.id}>
              <strong>Approval required · {a.description}</strong>
              <details>
                <summary>Review request</summary>
                <pre>{JSON.stringify(a.detail, null, 2)}</pre>
              </details>
              <button
                onClick={() =>
                  void act(() => api(`/approvals/${a.id}`, { approved: false }))
                }
              >
                Decline
              </button>
              <button
                onClick={() =>
                  void act(() => api(`/approvals/${a.id}`, { approved: true }))
                }
              >
                Approve once
              </button>
            </div>
          ))}
        {tab === 'Command' && (
          <div className="command-view">
            <div className="chat-scroll">
              {!commands.length && (
                <div className="welcome">
                  <div className="terminal-symbol">›_</div>
                  <span>
                    {project ? 'COMMAND CENTER' : 'NO WORKSPACE OPEN'}
                  </span>
                  <h1>
                    {project
                      ? 'What would you like to build?'
                      : 'Open your workspace.'}
                  </h1>
                  <p>
                    {project
                      ? 'Your first prompt starts the coordinator. Tasks, messages, and contributions appear as your agents work.'
                      : 'Connect your Codex accounts and open a local Git project to begin. No agents run until you send a prompt.'}
                  </p>
                  {project && (
                    <div className="quick-prompts">
                      {[
                        'Inspect the repository and plan the next milestone.',
                        'Review the current work and identify blockers.',
                        'Coordinate implementation and independent tests.',
                      ].map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            setPrompt(p);
                            setMode('plan');
                          }}
                        >
                          {p} ↗
                        </button>
                      ))}
                    </div>
                  )}
                  {!project && (
                    <button
                      className="accent"
                      onClick={() => setSettings(true)}
                    >
                      Connect accounts & open workspace →
                    </button>
                  )}
                </div>
              )}
              {commands.map((c) => (
                <div className="exchange" key={c.id}>
                  <div className="chat-author">
                    YOU{' '}
                    <span>
                      {new Date(c.at).toLocaleTimeString()} · {c.mode} ·{' '}
                      {c.targets.length} workers
                    </span>
                  </div>
                  <p>{c.text}</p>
                  <div className="dispatch">
                    <span>NEXUS / DISPATCH</span>
                    <pre>{c.result}</pre>
                  </div>
                </div>
              ))}
              {commands.length > 0 &&
                tasks
                  .filter(
                    (t) =>
                      s.agents.find((a) => a.id === t.agentId)?.role ===
                        'coordinator' && t.output,
                  )
                  .map((t) => (
                    <div className="exchange" key={t.id}>
                      <div className="chat-author">
                        COORDINATOR <span>{t.status}</span>
                      </div>
                      <pre>{t.output}</pre>
                    </div>
                  ))}
            </div>
            <div className="composer">
              {project &&
                s.projects.find((p) => p.id === project)?.status ===
                  'paused' && (
                  <p className="setup-required">
                    Scheduling is paused. Choose “Resume scheduling” to
                    continue. Interrupted tasks still require Resume in Agents.
                  </p>
                )}
              {project && !ready && (
                <p className="setup-required">
                  Sign into a Codex account in workspace setup to start real
                  work.
                </p>
              )}
              <div className="composer-options">
                <select
                  aria-label="Command destination"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="all">◎ All project workers</option>
                  {s.accounts
                    .filter((a) => a.status === 'ready')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.provider}
                      </option>
                    ))}
                </select>
                <select
                  aria-label="Command mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="direct">Direct / override</option>
                  <option value="plan">Plan new work</option>
                  <option value="pause">Pause project</option>
                  <option value="resume">Resume scheduling</option>
                </select>
              </div>
              <textarea
                disabled={!project || !ready}
                aria-label="Master prompt"
                placeholder={
                  project
                    ? 'Direct your team…'
                    : 'Create a project in workspace setup to begin…'
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="composer-bottom">
                <span>Inherited permissions · approval gates active</span>
                <button
                  className="accent"
                  disabled={busy || !project || !ready || !prompt.trim()}
                  onClick={() => void send()}
                >
                  Send directive ↑
                </button>
              </div>
            </div>
            <div className="composer-hint">
              Ctrl + Enter to send · Active turns receive steering; idle workers
              queue continuation.
            </div>
          </div>
        )}
        {tab === 'Brain' && (
          <Brain
            state={s}
            projectId={project}
            onAgent={(id) => {
              setSelected(id);
              setTab('Agents');
            }}
          />
        )}
        {tab === 'Agents' && (
          <div className="agents-view">
            <div className="agent-tabs">
              {agents
                .filter((a) => target === 'all' || a.accountId === target)
                .map((a) => (
                  <button
                    key={a.id}
                    className={activeTask?.agentId === a.id ? 'selected' : ''}
                    onClick={() => setSelected(a.id)}
                  >
                    <i className={a.status === 'running' ? 'ready' : ''} />
                    {a.role}
                    <small>{a.status}</small>
                  </button>
                ))}
              {!agents.length && (
                <p>No workers yet. Submit a plan from Command.</p>
              )}
            </div>
            {activeTask && (
              <div className="worker-pane">
                <div className="worker-title">
                  <div>
                    <h2>{activeTask.title}</h2>
                    <p>
                      {
                        s.accounts.find(
                          (a) =>
                            a.id ===
                            s.agents.find((a) => a.id === activeTask.agentId)
                              ?.accountId,
                        )?.name
                      }{' '}
                      / {activeTask.status} /{' '}
                      {s.agents.find((a) => a.id === activeTask.agentId)?.kind}
                    </p>
                  </div>
                  <div>
                    {activeTask.status === 'running' ? (
                      <button
                        onClick={() =>
                          void act(() =>
                            api(`/tasks/${activeTask.id}/stop`, {}),
                          )
                        }
                      >
                        Interrupt
                      </button>
                    ) : (
                      ['blocked', 'failed', 'interrupted'].includes(
                        activeTask.status,
                      ) && (
                        <button
                          onClick={() =>
                            void act(() =>
                              api(`/tasks/${activeTask.id}/resume`, {}),
                            )
                          }
                        >
                          Resume task
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="worker-meta">
                  <span>⑂ {activeTask.branch || 'branch pending'}</span>
                  <span>▱ {activeTask.worktree || 'worktree pending'}</span>
                </div>
                <div className="worker-stream">
                  <div className="stream-label">ASSIGNMENT</div>
                  <pre>{activeTask.prompt}</pre>
                  <div className="stream-label">
                    LIVE OUTPUT / {activeTask.status.toUpperCase()}
                  </div>
                  <pre>
                    {activeTask.output || 'Waiting for runtime output…'}
                  </pre>
                  {activeTask.error && (
                    <pre className="failure">{activeTask.error}</pre>
                  )}
                  <div className="stream-label">COMMUNICATION</div>
                  {s.messages
                    .filter(
                      (m) =>
                        m.sender === activeTask.agentId ||
                        m.recipient === activeTask.agentId,
                    )
                    .map((m) => (
                      <div className="worker-message" key={m.id}>
                        <span>
                          {m.type} ·{' '}
                          {m.sender === activeTask.agentId
                            ? 'sent'
                            : 'received'}
                        </span>
                        <pre>
                          {typeof m.payload === 'string'
                            ? m.payload
                            : JSON.stringify(m.payload, null, 2)}
                        </pre>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
        <footer>
          <span>
            <i className={connected ? 'ready' : ''} />{' '}
            {connected ? 'engine online' : 'offline'}
          </span>
          <span>
            {s.accounts.filter((a) => a.status === 'ready').length} accounts
            ready
          </span>
          <span>
            {tasks.filter((t) => t.status === 'running').length} running
          </span>
          <span>⑂ isolated worktrees</span>
          <span className="footer-right">{tab} / nexus 0.2</span>
        </footer>
      </section>
      {settings && (
        <div className="setup-backdrop">
          <div className="setup">
            <div className="setup-title">
              <h2>Workspace setup</h2>
              <button onClick={() => setSettings(false)}>×</button>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <p>
              Connect each account separately using official Codex sign-in.
              Complete the secure login in your browser, then verify here.
            </p>
            <h3>01 / Accounts</h3>
            {s.accounts.map((a) => (
              <div className="setup-account" key={a.id}>
                <div>
                  <strong>{a.name}</strong>
                  <small>
                    {a.status} · {a.detail || a.provider}
                  </small>
                </div>
                {a.provider === 'codex' && (
                  <>
                    <button
                      disabled={a.status === 'signing-in'}
                      onClick={() =>
                        void act(async () => {
                          const r = await api(`/accounts/${a.id}/login`, {});
                          setAuth(r.authUrl);
                        })
                      }
                    >
                      Sign in
                    </button>
                    <button
                      onClick={() =>
                        void act(() => api(`/accounts/${a.id}/verify`, {}))
                      }
                    >
                      Verify
                    </button>
                    {a.status === 'signing-in' && (
                      <button
                        onClick={() =>
                          void act(async () => {
                            await api(`/accounts/${a.id}/cancel-login`, {});
                            setAuth('');
                          })
                        }
                      >
                        Cancel sign-in
                      </button>
                    )}
                    {a.status === 'ready' && (
                      <button
                        onClick={() =>
                          void act(() => api(`/accounts/${a.id}/logout`, {}))
                        }
                      >
                        Sign out
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
            {auth && (
              <a
                className="auth-link"
                href={auth}
                target="_blank"
                rel="noreferrer"
              >
                Open secure ChatGPT sign-in ↗
              </a>
            )}
            <form
              onSubmit={(e) => {
                const v = form(e);
                void act(() => api('/accounts', v));
                e.currentTarget.reset();
              }}
            >
              <input name="name" required placeholder="Account name" />
              {s.installation === 'mock' ? (
                <select name="provider">
                  <option value="mock">Simulation</option>
                </select>
              ) : (
                <input type="hidden" name="provider" value="codex" />
              )}
              <button>Add account</button>
            </form>
            <h3>02 / Repository</h3>
            <form
              onSubmit={(e) => {
                const v = form(e);
                void act(() => api('/repos', v));
              }}
            >
              <input name="name" required placeholder="Repository name" />
              <input
                name="path"
                required
                placeholder="C:\Projects\your-repo"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
              />
              {window.nexusDesktop && (
                <button
                  type="button"
                  onClick={() =>
                    void act(async () => {
                      const path =
                        await window.nexusDesktop!.chooseRepository();
                      if (path) setRepoPath(path);
                    })
                  }
                >
                  Browse…
                </button>
              )}
              <button>Add local repo</button>
            </form>
            <h3>03 / Project</h3>
            <form
              className="project-form"
              onSubmit={(e) => {
                const v = form(e);
                void act(async () => {
                  const p = await api('/projects', v);
                  setProject(p.id);
                  setTarget('all');
                  setTab('Command');
                  setSettings(false);
                });
              }}
            >
              <input name="name" required placeholder="Project name" />
              <select name="repoId" required>
                <option value="">Repository</option>
                {s.repos.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select name="accountId" required>
                <option value="">Coordinator account</option>
                {s.accounts
                  .filter((a) => a.status === 'ready')
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
              <textarea
                name="objective"
                placeholder="Workspace description (optional). Send your first instruction from Command."
              />
              <button className="accent" disabled={!ready}>
                Open project workspace
              </button>
            </form>
            {s.installation === 'mock' && (
              <>
                <hr />
                <button
                  onClick={() =>
                    void act(async () => {
                      const r = await api('/demo', {});
                      setProject(r.project.id);
                      setSettings(false);
                    })
                  }
                >
                  Run three-account simulation
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
