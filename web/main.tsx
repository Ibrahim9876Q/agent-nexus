import React, { useEffect, useRef, useState } from 'react';
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
import { AccountCapacity } from './AccountCapacity';
import { AccountSettings } from './AccountSettings';
import { ChatResponse } from './ChatResponse';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
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
function NexusLogo() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M10 29V11l20 18V11M10 20h20"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="11" r="3" fill="currentColor" />
      <circle cx="30" cy="29" r="3" fill="currentColor" />
    </svg>
  );
}
function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'panel' && (
        <>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M9 4v16" />
        </>
      )}
      {name === 'Command' && (
        <>
          <path d="M20 11.5a8 8 0 0 1-8 8H4l1.8-4A8 8 0 1 1 20 11.5Z" />
          <path d="M8 10h8M8 14h5" />
        </>
      )}
      {name === 'Brain' && (
        <>
          <path d="m6 6 12 2-6 10L6 6Zm0 0 0 11 6 1" />
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="8" r="2" />
          <circle cx="12" cy="18" r="2" />
          <circle cx="6" cy="17" r="1.5" />
        </>
      )}
      {name === 'Agents' && (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2" />
        </>
      )}
      {name === 'settings' && (
        <>
          <path d="M4 7h16M4 17h16" />
          <circle cx="9" cy="7" r="2" />
          <circle cx="15" cy="17" r="2" />
        </>
      )}
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
      {name === 'send' && <path d="M12 19V5m-6 6 6-6 6 6" />}
    </svg>
  );
}
function App() {
  const [s, setS] = useState<State>(),
    [tab, setTab] = useState('Command'),
    [project, setProject] = useState(''),
    [target, setTarget] = useState('all'),
    [prompt, setPrompt] = useState(''),
    [mode, setMode] = useState('chat'),
    [error, setError] = useState(''),
    [connected, setConnected] = useState(false),
    [settings, setSettings] = useState(false),
    [auth, setAuth] = useState(''),
    [copiedAuth, setCopiedAuth] = useState(''),
    [selected, setSelected] = useState(''),
    [repoPath, setRepoPath] = useState(''),
    [fontScale, setFontScale] = useState(() => {
      try {
        const n = Number(localStorage.getItem('nexus-font-scale'));
        return n >= 0.9 && n <= 1.3 ? n : 1;
      } catch {
        return 1;
      }
    }),
    [shortcuts, setShortcuts] = useState(false),
    [sidebarOpen, setSidebarOpen] = useState(true),
    [busy, setBusy] = useState(false);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const input = composerInput.current;
    if (input) {
      input.style.height = 'auto';
      input.style.height = Math.min(180, input.scrollHeight) + 'px';
    }
  }, [prompt, !!s, tab]);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setSettings(false);
        setShortcuts(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--font-scale',
      String(fontScale),
    );
    try {
      localStorage.setItem('nexus-font-scale', String(fontScale));
    } catch {}
  }, [fontScale]);
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
    if (busy || !prompt.trim() || !project || !ready) return;
    setBusy(true);
    try {
      const result = await act(() =>
        api('/command', {
          projectId: project,
          text: prompt,
          mode,
          ...(target !== 'all' ? { accountId: target } : {}),
        }),
      );
      if (result) setPrompt('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={'desktop ' + (window.nexusDesktop ? 'native-window' : '')}>
      {sidebarOpen && (
        <aside
          className="explorer"
          id="workspace-sidebar"
          aria-label="Workspace sidebar"
        >
          <div className="workspace-name">
            <div className="brand">
              <NexusLogo />
              <strong>Nexus</strong>
            </div>
            <button
              className="icon-button"
              aria-label="Close sidebar"
              aria-expanded={true}
              aria-controls="workspace-sidebar"
              title="Close sidebar (Ctrl+B)"
              onClick={() => setSidebarOpen(false)}
            >
              <Icon name="panel" />
            </button>
          </div>
          <nav className="side-nav" aria-label="Main navigation">
            {['Command', 'Brain', 'Agents'].map((name) => (
              <button
                key={name}
                aria-current={tab === name ? 'page' : undefined}
                className={tab === name ? 'selected' : ''}
                onClick={() => setTab(name)}
              >
                <Icon name={name} />
                <span>{name}</span>
                {name === 'Agents' && agents.length > 0 && (
                  <small>{agents.length}</small>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-scroll">
            {s.projects.length > 0 && (
              <>
                <div className="explorer-label">Workspace</div>
                <select
                  aria-label="Project"
                  value={project}
                  onChange={(e) => {
                    setProject(e.target.value);
                    setSelected('');
                    setTarget('all');
                  }}
                >
                  <option value="">No workspace open</option>
                  {s.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {s.accounts.length > 0 && (
              <>
                <div className="explorer-label">
                  Accounts <small>{s.accounts.length}</small>
                </div>
                <div className="file-tree">
                  {s.accounts.map((a) => (
                    <div className="sidebar-account" key={a.id}>
                      <button
                        onClick={() => {
                          setTarget(a.id);
                          setTab('Agents');
                        }}
                      >
                        <i className={a.status === 'ready' ? 'ready' : ''} />
                        {a.name}
                        <small>{a.provider}</small>
                      </button>
                      <AccountCapacity account={a} compact />
                    </div>
                  ))}
                </div>
              </>
            )}
            {tasks.length > 0 && (
              <>
                <div className="explorer-label">
                  Tasks <small>{tasks.length}</small>
                </div>
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
              </>
            )}
          </div>
          <div className="sidebar-bottom">
            <button
              className="workspace-settings"
              onClick={() => setSettings(true)}
            >
              <Icon name="settings" /> Workspace & accounts
            </button>
            <div className="sidebar-tools">
              <span
                className="engine-state"
                title={
                  connected
                    ? 'Local engine connected'
                    : 'Reconnecting to local engine'
                }
              >
                <i className={connected ? 'ready' : ''} />
                {connected ? 'Local engine' : 'Reconnecting…'}
              </span>
              <button
                aria-label="Decrease text size"
                onClick={() =>
                  setFontScale((v) => Math.max(0.9, +(v - 0.1).toFixed(1)))
                }
              >
                A−
              </button>
              <button
                aria-label="Increase text size"
                onClick={() =>
                  setFontScale((v) => Math.min(1.3, +(v + 0.1).toFixed(1)))
                }
              >
                A+
              </button>
              <button
                aria-label="Keyboard shortcuts"
                onClick={() => setShortcuts(true)}
              >
                ?
              </button>
            </div>
          </div>
        </aside>
      )}
      <section className="surface">
        <header className="window-bar">
          {!sidebarOpen && (
            <button
              className="icon-button"
              aria-label="Open sidebar"
              aria-expanded={false}
              aria-controls="workspace-sidebar"
              title="Open sidebar (Ctrl+B)"
              onClick={() => setSidebarOpen(true)}
            >
              <Icon name="panel" />
            </button>
          )}
          <span>
            {project
              ? s.projects.find((p) => p.id === project)?.name
              : tab === 'Command'
                ? ''
                : tab}
          </span>
          {project && (
            <button
              className="icon-button header-settings"
              aria-label="Workspace and accounts"
              onClick={() => setSettings(true)}
            >
              <Icon name="settings" />
            </button>
          )}
        </header>
        {s.installation === 'mock' && (
          <div className="mock-banner">
            MOCK INSTALLATION · Scripted workers only · Separate test data
          </div>
        )}
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
          <div className={'command-view' + (!commands.length ? ' empty' : '')}>
            <div className="chat-scroll">
              {!commands.length && (
                <div className="welcome">
                  <div className="welcome-logo">
                    <NexusLogo />
                  </div>
                  <h1>
                    {project ? 'What are we building?' : 'No workspace open'}
                  </h1>
                  {!project && (
                    <button
                      className="connect-button"
                      onClick={() => setSettings(true)}
                    >
                      <Icon name="plus" /> Connect workspace & accounts
                    </button>
                  )}
                </div>
              )}
              {commands.map((c, index) => (
                <div className="exchange" key={c.id}>
                  <div className="chat-author">
                    YOU <span>{new Date(c.at).toLocaleTimeString()}</span>
                  </div>
                  <p>{c.text}</p>
                  {!commands
                    .slice(index + 1)
                    .some(
                      (later) =>
                        c.taskIds?.[0] && later.taskIds?.includes(c.taskIds[0]),
                    ) && <ChatResponse command={c} state={s} />}
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
              <textarea
                ref={composerInput}
                rows={1}
                aria-label="Master prompt"
                placeholder={
                  project ? 'How can I help?' : 'What would you like to build?'
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="composer-bottom">
                <span>
                  {project
                    ? 'Enter to send · Shift+Enter for a new line'
                    : 'Connect a workspace to send a prompt'}
                </span>
                <button
                  className="accent send-button"
                  aria-label="Send instruction"
                  title="Send instruction (Ctrl+Enter)"
                  disabled={busy || !project || !ready || !prompt.trim()}
                  onClick={() => void send()}
                >
                  <Icon name="send" />
                </button>
              </div>
            </div>
            {project && (
              <div className="composer-options">
                <select
                  aria-label="Command destination"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="all">Coordinator / auto team</option>
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
                  <option value="chat">Chat</option>
                  <option value="direct">Direct / override</option>
                  <option value="plan">Plan new work</option>
                  <option value="pause">Pause project</option>
                  <option value="resume">Resume scheduling</option>
                </select>
              </div>
            )}
            {project && (
              <div className="composer-hint">
                Chat uses one coordinator. It can bring in other accounts when
                useful.
              </div>
            )}
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
                  <div className="stream-label">RUNTIME ACTIVITY</div>
                  <div className="activity-lines">
                    {activeTask.activity?.length ? (
                      activeTask.activity.map((item) => (
                        <details
                          key={item.id}
                          className={
                            'activity-line ' +
                            (item.exitCode != null && item.exitCode !== 0
                              ? 'failed'
                              : '')
                          }
                        >
                          <summary>
                            <span className="activity-bullet">
                              {item.status === 'running'
                                ? '◌'
                                : item.exitCode != null && item.exitCode !== 0
                                  ? '×'
                                  : '·'}
                            </span>
                            <strong>
                              {item.kind === 'command'
                                ? 'Shell'
                                : item.kind === 'file'
                                  ? 'Edit'
                                  : 'Tool'}
                            </strong>
                            <span>{item.label}</span>
                            <small>
                              {item.exitCode != null
                                ? `exit ${item.exitCode}`
                                : item.status}
                              {item.durationMs != null
                                ? ` · ${(item.durationMs / 1000).toFixed(1)}s`
                                : ''}
                            </small>
                          </summary>
                          <pre>{item.label}</pre>
                        </details>
                      ))
                    ) : (
                      <p className="activity-empty">
                        No command or tool events reported yet.
                      </p>
                    )}
                  </div>
                  <div className="stream-label">
                    LIVE OUTPUT / {activeTask.status.toUpperCase()}
                  </div>
                  <details className="thinking-panel">
                    <summary>Thinking summary & progress</summary>
                    {activeTask.reasoningSummary && (
                      <p>{activeTask.reasoningSummary}</p>
                    )}
                    {activeTask.responseItems
                      ?.filter((i) => i.phase === 'commentary')
                      .map((i) => (
                        <p key={i.id}>{i.text}</p>
                      ))}
                  </details>
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
      </section>
      {settings && (
        <div className="setup-backdrop">
          <div
            className="setup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-heading"
          >
            <div className="setup-title">
              <h2 id="setup-heading">Workspace & accounts</h2>
              <button
                aria-label="Close workspace setup"
                onClick={() => setSettings(false)}
              >
                ×
              </button>
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
                  <AccountCapacity account={a} />
                </div>
                <button
                  onClick={() =>
                    void act(() =>
                      api(`/accounts/${a.id}/admission`, {
                        enabled: a.enabled === false,
                      }),
                    )
                  }
                >
                  {a.enabled === false ? 'Enable new work' : 'Drain account'}
                </button>
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
                    {a.status === 'ready' && (
                      <button
                        onClick={() =>
                          void act(() => api(`/accounts/${a.id}/capacity`, {}))
                        }
                      >
                        Refresh capacity
                      </button>
                    )}
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
                {a.provider === 'codex' && (
                  <AccountSettings account={a} onAction={act} />
                )}
              </div>
            ))}
            {auth && (
              <div className="auth-actions">
                <a
                  className="auth-link"
                  href={auth}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open secure ChatGPT sign-in ↗
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    setError('');
                    setCopiedAuth('');
                    try {
                      await navigator.clipboard.writeText(auth);
                      setCopiedAuth(auth);
                    } catch {
                      setError(
                        'Could not copy the sign-in link to your clipboard. Please try again.',
                      );
                    }
                  }}
                >
                  Copy link
                </button>
                <span className="auth-copy-status" role="status">
                  {copiedAuth === auth ? 'Link copied' : ''}
                </span>
              </div>
            )}
            <form
              onSubmit={(e) => {
                const v = form(e);
                void act(() => api('/accounts', v));
                e.currentTarget.reset();
              }}
            >
              <input
                name="name"
                required
                placeholder="Account email"
                aria-label="Account email"
                inputMode="email"
                autoComplete="email"
              />
              {s.installation === 'mock' ? (
                <select name="provider">
                  <option value="mock">Simulation</option>
                </select>
              ) : (
                <input type="hidden" name="provider" value="codex" />
              )}
              <button>Add account</button>
            </form>
            <h3>02 / Project folder</h3>
            <p>
              Choose an existing Git repository or a new empty folder. Nexus
              automatically sets up Git and the first commit for empty folders.
            </p>
            <form
              onSubmit={(e) => {
                const v = form(e);
                void act(() => api('/repos', v));
              }}
            >
              <input name="name" required placeholder="Folder name" />
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
              <button>Add folder</button>
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
      {shortcuts && (
        <div className="setup-backdrop" onClick={() => setShortcuts(false)}>
          <div className="setup shortcuts" onClick={(e) => e.stopPropagation()}>
            <div className="setup-title">
              <h2>Keyboard & navigation</h2>
              <button
                aria-label="Close shortcuts"
                onClick={() => setShortcuts(false)}
              >
                ×
              </button>
            </div>
            <p>
              <kbd>Enter</kbd> send · <kbd>Shift + Enter</kbd> new line
            </p>
            <p>
              <kbd>A−</kbd> / <kbd>A＋</kbd> adjust interface text size
            </p>
            <p>
              <kbd>Scroll</kbd> zoom the Brain · drag empty canvas to pan
            </p>
            <p>
              <kbd>Ctrl</kbd> + <kbd>B</kbd> open or close the sidebar
            </p>
            <p>Click an agent node to inspect ownership and open its stream.</p>
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
