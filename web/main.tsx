import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  Account,
  Agent,
  Approval,
  Delivery,
  Event,
  Message,
  Project,
  Repo,
  Task,
} from '../src/types';
import './style.css';
type State = {
  accounts: Account[];
  repos: Repo[];
  projects: Project[];
  agents: Agent[];
  tasks: Task[];
  messages: Message[];
  deliveries: Delivery[];
  approvals: Approval[];
  events: Event[];
  settings: { globalConcurrency: number };
};
let token = '';
async function api(path: string, body?: unknown, method?: string) {
  const r = await fetch('/api' + path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', 'X-Nexus-Token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}
const views = [
  'Overview',
  'Agent network',
  'Task board',
  'Dependencies',
  'Communication',
  'Repositories',
  'Knowledge',
  'Settings',
];
const badge = (value: string) => (
  <span className={'badge ' + value}>{value}</span>
);
const label = (value: string) => value.slice(0, 8);
function App() {
  const [state, setState] = useState<State>();
  const [view, setView] = useState('Overview');
  const [projectId, setProject] = useState('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loginUrl, setLoginUrl] = useState<string>();
  const [live, setLive] = useState(false);
  const [dialog, setDialog] = useState<string>();
  const [selected, setSelected] = useState<Task>();
  const [notes, setNotes] = useState<{ id: string; body: string }[]>([]);
  useEffect(() => setNotes([]), [projectId]);
  useEffect(() => {
    let disposed = false,
      ws: WebSocket | undefined,
      retry: ReturnType<typeof setTimeout>;
    async function connect() {
      try {
        token = (await (await fetch('/api/session')).json()).token;
        const data = await api('/state');
        if (disposed) return;
        setState(data);
        ws = new WebSocket(`ws://${location.host}/live?token=${token}`);
        ws.onopen = () => setLive(true);
        ws.onmessage = (e) => setState(JSON.parse(e.data));
        ws.onclose = () => {
          setLive(false);
          if (!disposed) retry = setTimeout(connect, 2000);
        };
      } catch (e) {
        if (!disposed) {
          setError(String(e));
          retry = setTimeout(connect, 3000);
        }
      }
    }
    void connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);
  const act = async (fn: () => Promise<unknown>, message?: string) => {
    setError('');
    try {
      const result = await fn();
      if (message) setNotice(message);
      setState(await api('/state'));
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  };
  if (!state)
    return (
      <main className="loading">
        <div className="logo">N</div>
        <h1>Connecting to Nexus</h1>
        <p>{error || 'Loading your local workspace…'}</p>
      </main>
    );
  const agents = state.agents.filter(
      (a) => projectId === 'all' || a.projectId === projectId,
    ),
    tasks = state.tasks.filter(
      (t) => projectId === 'all' || t.projectId === projectId,
    );
  const messages = state.messages.filter(
    (m) => projectId === 'all' || m.projectId === projectId,
  );
  const agentName = (id: string) =>
    state.agents.find((a) => a.id === id)?.role || label(id);
  const accountName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.name || label(id);
  const pendingApprovals = state.approvals.filter(
    (a) => a.status === 'pending',
  );
  const form = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return Object.fromEntries(new FormData(event.currentTarget));
  };
  const showTask = (t: Task) => {
    setSelected(t);
    setDialog('task');
  };
  const currentTask = selected
    ? state.tasks.find((t) => t.id === selected.id)
    : undefined;
  const taskCard = (t: Task) => (
    <button key={t.id} className="task-card" onClick={() => showTask(t)}>
      <div className="row">
        {badge(t.status)}
        <small>{label(t.id)}</small>
      </div>
      <h3>{t.title}</h3>
      <p>
        {agentName(t.agentId)} ·{' '}
        {accountName(state.agents.find((a) => a.id === t.agentId)!.accountId)}
      </p>
      <div className="row">
        <small>
          {t.dependencies.length
            ? `${t.dependencies.length} prerequisites`
            : 'Independent task'}
        </small>
        <span>↗</span>
      </div>
    </button>
  );
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="#" onClick={() => setView('Overview')}>
          <span className="logo">N</span>
          <span>
            agent nexus<small>LOCAL WORKSPACE</small>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {views.map((v, i) => (
            <button
              key={v}
              className={view === v ? 'active' : ''}
              onClick={() => setView(v)}
            >
              <span>{['◈', '⌘', '▦', '⤴', '≋', '◇', '▤', '⚙'][i]}</span>
              {v}
              {v === 'Communication' && <small>{messages.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className={'dot ' + (live ? 'on' : '')} />
          {live ? 'Local connection live' : 'Reconnecting…'}
          <p>
            Independent accounts.
            <br />
            One coordinated workspace.
          </p>
          <span className="version">MVP · 0.1.0</span>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">YOUR DEVELOPMENT TEAM</span>
            <h1>{view}</h1>
          </div>
          <div className="header-actions">
            <select
              aria-label="Filter project"
              value={projectId}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="all">All projects</option>
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="primary" onClick={() => setDialog('project')}>
              ＋ New project
            </button>
          </div>
        </header>
        {error && (
          <div className="alert error" role="alert">
            {error}
            <button onClick={() => setError('')}>×</button>
          </div>
        )}
        {notice && (
          <div className="alert" role="status">
            {notice}
            <button onClick={() => setNotice('')}>×</button>
          </div>
        )}
        {!!pendingApprovals.length && (
          <section className="panel approval">
            <h2>Human approval needed</h2>
            {pendingApprovals.map((a) => (
              <div key={a.id}>
                <p>{a.description}</p>
                <details>
                  <summary>Review exact request</summary>
                  <pre>{JSON.stringify(a.detail, null, 2)}</pre>
                </details>
                <div className="actions">
                  <button
                    onClick={() =>
                      void act(() =>
                        api(`/approvals/${a.id}`, { approved: false }),
                      )
                    }
                  >
                    Decline
                  </button>
                  <button
                    className="primary"
                    onClick={() =>
                      void act(() =>
                        api(`/approvals/${a.id}`, { approved: true }),
                      )
                    }
                  >
                    Approve this request
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
        {loginUrl && (
          <div className="alert">
            <a href={loginUrl} target="_blank" rel="noopener noreferrer">
              Open official ChatGPT sign-in ↗
            </a>
            <button onClick={() => setLoginUrl(undefined)}>×</button>
          </div>
        )}
        {view === 'Overview' && (
          <>
            <section className="hero">
              <div>
                <span className="eyebrow">COORDINATE. DELEGATE. BUILD.</span>
                <h2>
                  A clear view of
                  <br />
                  work in motion.
                </h2>
                <p>
                  Give your agents an objective. Follow their decisions,
                  <br />
                  dependencies, and changes from one place.
                </p>
                <div className="actions">
                  <button
                    className="primary"
                    onClick={() =>
                      void act(
                        () => api('/demo', {}),
                        'Simulation started. These are mock accounts; no Codex usage is consumed.',
                      )
                    }
                  >
                    Run three-account demo ↗
                  </button>
                  <button
                    onClick={() => {
                      setView('Settings');
                      setDialog('account');
                    }}
                  >
                    Connect an account
                  </button>
                </div>
              </div>
              <div className="orbit" aria-hidden="true">
                <div className="orbit-node top">
                  A <i />
                </div>
                <div className="orbit-node left">
                  B <i />
                </div>
                <div className="orbit-center">N</div>
                <div className="orbit-node right">
                  C <i />
                </div>
                <span>AGENT NEXUS</span>
              </div>
            </section>
            <div className="metrics">
              {[
                [
                  'Connected accounts',
                  state.accounts.filter((a) => a.status === 'ready').length,
                  'Independent authentication',
                ],
                [
                  'Running agents',
                  agents.filter((a) => a.status === 'running').length,
                  `${state.settings.globalConcurrency} total execution slots`,
                ],
                [
                  'Completed tasks',
                  tasks.filter((t) => t.status === 'completed').length,
                  `${tasks.length} tasks in this view`,
                ],
                [
                  'Messages exchanged',
                  messages.length,
                  'Durable delivery + acknowledgment',
                ],
              ].map(([title, value, detail]) => (
                <div className="metric" key={title}>
                  <span>{title}</span>
                  <strong>{value}</strong>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
            <div className="two-col">
              <section className="panel">
                <div className="section-head">
                  <h2>Projects</h2>
                  <span>{state.projects.length} total</span>
                </div>
                {!state.projects.length && (
                  <Empty text="Start a project or run the demo to see your team work." />
                )}
                {state.projects.map((p) => (
                  <div className="project-row" key={p.id}>
                    <div>
                      <h3>{p.name}</h3>
                      <p>{state.repos.find((r) => r.id === p.repoId)?.name}</p>
                    </div>
                    {badge(p.status)}
                    <button
                      onClick={() =>
                        void act(() =>
                          api(`/projects/${p.id}/pause`, {
                            paused: p.status !== 'paused',
                          }),
                        )
                      }
                    >
                      {p.status === 'paused' ? 'Resume scheduling' : 'Pause'}
                    </button>
                  </div>
                ))}
              </section>
              <section className="panel">
                <div className="section-head">
                  <h2>Recent activity</h2>
                  <span className="live-label">● LIVE</span>
                </div>
                {state.events
                  .slice(-7)
                  .reverse()
                  .map((e) => (
                    <div className="activity" key={e.id}>
                      <span className="dot on" />
                      <div>
                        <strong>{e.type.replaceAll('.', ' / ')}</strong>
                        <small>{new Date(e.at).toLocaleTimeString()}</small>
                      </div>
                    </div>
                  ))}
                {!state.events.length && (
                  <Empty text="Agent activity appears here as work starts." />
                )}
              </section>
            </div>
          </>
        )}
        {view === 'Agent network' && (
          <>
            <div className="section-head">
              <p>
                Workers can request children, which inherit their account and
                permissions.
              </p>
              <span>
                Native research activity is recorded in the event log.
              </span>
            </div>
            {state.accounts.map((account) => (
              <section className="panel" key={account.id}>
                <div className="section-head">
                  <h2>{account.name}</h2>
                  {badge(account.provider)}
                  <span>
                    {account.concurrency} slots · depth {account.maxDepth} ·{' '}
                    {account.nativeLimit} native research helpers
                  </span>
                </div>
                <div className="agent-grid">
                  {agents
                    .filter((a) => a.accountId === account.id)
                    .map((a) => (
                      <article
                        className="agent-card"
                        key={a.id}
                        style={{ marginLeft: Math.min(a.depth, 3) * 16 }}
                      >
                        <div className="row">
                          <span className="avatar">
                            {a.role.slice(0, 1).toUpperCase()}
                          </span>
                          {badge(a.status)}
                        </div>
                        <h3>{a.role}</h3>
                        <p>
                          {a.kind} · {a.permissions}
                        </p>
                        <small>
                          {a.parentId
                            ? `↳ parent: ${agentName(a.parentId)}`
                            : 'Parent worker'}{' '}
                          · depth {a.depth}
                        </small>
                        <div className="actions">
                          <button
                            onClick={() => {
                              setSelected(
                                state.tasks.find((t) => t.agentId === a.id),
                              );
                              setDialog('delegate');
                            }}
                          >
                            Delegate
                          </button>
                          {a.taskId && (
                            <button
                              onClick={() =>
                                showTask(
                                  state.tasks.find((t) => t.id === a.taskId)!,
                                )
                              }
                            >
                              Inspect
                            </button>
                          )}
                          {!['running', 'retired'].includes(a.status) && (
                            <button
                              onClick={() =>
                                void act(
                                  () => api(`/agents/${a.id}/retire`, {}),
                                  'Worker retired; pool capacity released.',
                                )
                              }
                            >
                              Retire
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                </div>
                {!agents.some((a) => a.accountId === account.id) && (
                  <Empty text="No workers assigned to this account in the selected project." />
                )}
              </section>
            ))}
          </>
        )}
        {view === 'Task board' && (
          <>
            <div className="section-head">
              <p>Each coding task runs in its own branch and worktree.</p>
              <button onClick={() => setDialog('new-task')}>＋ Add task</button>
            </div>
            <div className="kanban">
              {[
                ['Queued', ['pending']],
                ['In progress', ['running']],
                ['Needs attention', ['blocked', 'failed', 'interrupted']],
                ['Completed', ['completed']],
              ].map(([name, statuses]) => (
                <section key={name as string}>
                  <div className="section-head">
                    <h2>{name}</h2>
                    <span>
                      {
                        tasks.filter((t) =>
                          (statuses as string[]).includes(t.status),
                        ).length
                      }
                    </span>
                  </div>
                  {tasks
                    .filter((t) => (statuses as string[]).includes(t.status))
                    .map(taskCard)}
                </section>
              ))}
            </div>
          </>
        )}
        {view === 'Dependencies' && (
          <section className="panel">
            <h2>Task dependency graph</h2>
            <p>
              Click a task to inspect it. Message-based dependencies can proceed
              alongside independent work.
            </p>
            <div className="dependency-list">
              {tasks.map((t) => (
                <div key={t.id} className="dependency-row">
                  <div>
                    {t.dependencies.length ? (
                      t.dependencies.map((d) => (
                        <button
                          key={d}
                          onClick={() =>
                            showTask(state.tasks.find((x) => x.id === d)!)
                          }
                        >
                          {state.tasks.find((x) => x.id === d)?.title}
                        </button>
                      ))
                    ) : (
                      <span className="muted">No prerequisites</span>
                    )}
                  </div>
                  <span>→</span>
                  {taskCard(t)}
                </div>
              ))}
            </div>
            {!tasks.length && <Empty text="No task dependencies yet." />}
          </section>
        )}
        {view === 'Communication' && (
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Communication center</h2>
                <p>
                  Queued, delivered, and acknowledged are tracked separately.
                </p>
              </div>
              <button onClick={() => setDialog('message')}>
                ＋ Send message
              </button>
            </div>
            {messages
              .slice()
              .reverse()
              .map((m) => (
                <article className="message" key={m.id}>
                  <div className="row">
                    <strong>
                      {agentName(m.sender)} <span className="muted">→</span>{' '}
                      {agentName(m.recipient)}
                    </strong>
                    <small>{new Date(m.timestamp).toLocaleTimeString()}</small>
                  </div>
                  <div className="actions">
                    {badge(m.type)}
                    {badge(
                      state.deliveries.find((d) => d.messageId === m.id)
                        ?.status || 'queued',
                    )}
                    <small>correlation {label(m.correlationId)}</small>
                  </div>
                  <pre>
                    {typeof m.payload === 'string'
                      ? m.payload
                      : JSON.stringify(m.payload, null, 2)}
                  </pre>
                </article>
              ))}
            {!messages.length && (
              <Empty text="Messages will appear when agents coordinate. Run the demo to see a contract negotiation." />
            )}
          </section>
        )}
        {view === 'Repositories' && (
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Repository workspaces</h2>
                <p>Add an existing local clone with at least one commit.</p>
              </div>
              <button className="primary" onClick={() => setDialog('repo')}>
                ＋ Add repository
              </button>
            </div>
            {state.repos.map((r) => (
              <article className="repo" key={r.id}>
                <h3>◇ {r.name}</h3>
                <code>{r.path}</code>
                {state.tasks
                  .filter(
                    (t) =>
                      state.projects.find((p) => p.id === t.projectId)
                        ?.repoId === r.id && t.worktree,
                  )
                  .map((t) => (
                    <div className="project-row" key={t.id}>
                      <div>
                        <strong>{t.title}</strong>
                        <small>{t.branch}</small>
                      </div>
                      {badge(t.status)}
                      <button onClick={() => showTask(t)}>
                        Review changes
                      </button>
                    </div>
                  ))}
              </article>
            ))}
            {!state.repos.length && (
              <Empty text="Your repositories stay local. Publication always requires an explicit approval." />
            )}
          </section>
        )}
        {view === 'Knowledge' && (
          <section className="panel">
            <h2>Shared project knowledge</h2>
            <p>
              Opt-in Markdown notes in .nexus/knowledge. Open this folder as an
              Obsidian vault. Notes are separate from live coordination.
            </p>
            {projectId === 'all' ? (
              <Empty text="Select a project above to search or save its knowledge." />
            ) : (
              <>
                <form
                  onSubmit={(e) => {
                    const v = form(e);
                    void act(async () => {
                      setNotes(
                        await api(
                          `/knowledge/${projectId}?q=${encodeURIComponent(String(v.query))}`,
                        ),
                      );
                    });
                  }}
                  className="inline-form"
                >
                  <input
                    name="query"
                    placeholder="Search decisions, contracts, or summaries"
                  />
                  <button>Search notes</button>
                  <button type="button" onClick={() => setDialog('note')}>
                    ＋ Save note
                  </button>
                </form>
                {notes.map((n) => (
                  <pre className="note" key={n.id}>
                    {n.body}
                  </pre>
                ))}
              </>
            )}
          </section>
        )}
        {view === 'Settings' && (
          <>
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Account connections</h2>
                  <p>
                    Sign in separately for each account. Usage limits remain
                    independent.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => setDialog('account')}
                >
                  ＋ Add account
                </button>
              </div>
              {state.accounts.map((a) => (
                <article className="account" key={a.id}>
                  <div className="section-head">
                    <div>
                      <h3>{a.name}</h3>
                      <p>
                        {a.provider === 'mock'
                          ? 'Simulated account · no model usage'
                          : a.detail || 'Official Codex app-server'}
                      </p>
                    </div>
                    {badge(a.status)}
                    {badge(a.provider)}
                  </div>
                  <form
                    className="limits"
                    onSubmit={(e) => {
                      const v = form(e);
                      void act(
                        () =>
                          api(
                            `/accounts/${a.id}`,
                            Object.fromEntries(
                              Object.entries(v).map(([k, value]) => [
                                k,
                                Number(value),
                              ]),
                            ),
                            'PATCH',
                          ),
                        'Account limits saved.',
                      );
                    }}
                  >
                    <label>
                      Execution slots
                      <input
                        name="concurrency"
                        type="number"
                        min="1"
                        max="12"
                        defaultValue={a.concurrency}
                      />
                    </label>
                    <label>
                      Native research helpers
                      <input
                        name="nativeLimit"
                        type="number"
                        min="0"
                        max="4"
                        defaultValue={a.nativeLimit}
                      />
                    </label>
                    <label>
                      Delegation depth
                      <input
                        name="maxDepth"
                        type="number"
                        min="1"
                        max="5"
                        defaultValue={a.maxDepth}
                      />
                    </label>
                    <label>
                      Worker pool cap
                      <input
                        name="maxAgents"
                        type="number"
                        min="1"
                        max="30"
                        defaultValue={a.maxAgents}
                      />
                    </label>
                    <button>Save limits</button>
                  </form>
                  {a.provider === 'codex' && (
                    <div className="actions">
                      <button
                        onClick={() =>
                          void act(async () => {
                            const login = await api(
                              `/accounts/${a.id}/login`,
                              {},
                            );
                            if (
                              login.authUrl &&
                              /^https:\/\//.test(login.authUrl)
                            ) {
                              setNotice(
                                'Complete sign-in in the official login page, then verify the connection.',
                              );
                              setLoginUrl(login.authUrl);
                            }
                          })
                        }
                      >
                        Sign in with ChatGPT ↗
                      </button>
                      <button
                        onClick={() =>
                          void act(
                            () => api(`/accounts/${a.id}/verify`, {}),
                            'Connection checked.',
                          )
                        }
                      >
                        Verify connection
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </section>
            <section className="panel">
              <h2>Delegation policy</h2>
              <p>
                Every worker can request worker-level children using
                nexus_delegate. Children receive their own worktree and can
                delegate again within the configured depth. Native Codex
                subagents are enabled only for read-only workers when native
                research helpers is greater than zero. Their reserved capacity
                counts toward account and global limits.
              </p>
              <p>
                Global execution budget: {state.settings.globalConcurrency}{' '}
                slots. Interrupted tasks require explicit resume. No automatic
                publishing, merging, or account switching after usage limits.
              </p>
            </section>
          </>
        )}
      </main>
      {dialog && (
        <div className="modal-backdrop" onClick={() => setDialog(undefined)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={dialog}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-head">
              <h2>
                {
                  (
                    {
                      account: 'Connect an account',
                      project: 'Start a project',
                      repo: 'Add a repository',
                      'new-task': 'Assign a task',
                      message: 'Send a message',
                      delegate: 'Request a delegated worker',
                      note: 'Save project knowledge',
                      task: currentTask?.title,
                    } as Record<string, string>
                  )[dialog]
                }
              </h2>
              <button
                aria-label="Close dialog"
                onClick={() => setDialog(undefined)}
              >
                ×
              </button>
            </div>
            {dialog === 'account' && (
              <form
                onSubmit={(e) => {
                  const v = form(e);
                  void act(async () => {
                    await api('/accounts', v);
                    setDialog(undefined);
                    setView('Settings');
                  });
                }}
              >
                <label>
                  Account name
                  <input
                    name="name"
                    required
                    placeholder="e.g. Architecture account"
                  />
                </label>
                <label>
                  Provider
                  <select name="provider">
                    <option value="codex">
                      Codex · official ChatGPT login
                    </option>
                    <option value="mock">Mock · simulation only</option>
                  </select>
                </label>
                <p>
                  Credentials remain in the account’s isolated local Codex home.
                  Nexus never asks for your password.
                </p>
                <button className="primary">Add account</button>
              </form>
            )}
            {dialog === 'repo' && (
              <form
                onSubmit={(e) => {
                  const v = form(e);
                  void act(async () => {
                    await api('/repos', v);
                    setDialog(undefined);
                  });
                }}
              >
                <label>
                  Name
                  <input name="name" required />
                </label>
                <label>
                  Absolute path to local repository
                  <input
                    name="path"
                    required
                    placeholder="C:\Projects\my-app"
                  />
                </label>
                <button className="primary">Add repository</button>
              </form>
            )}
            {dialog === 'project' && (
              <form
                onSubmit={(e) => {
                  const v = form(e);
                  void act(async () => {
                    const p = await api('/projects', v);
                    setProject(p.id);
                    setDialog(undefined);
                  });
                }}
              >
                <label>
                  Project name
                  <input name="name" required />
                </label>
                <label>
                  Repository
                  <select name="repoId" required>
                    <option value="">Select repository</option>
                    {state.repos.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Coordinator account
                  <select name="accountId" required>
                    <option value="">Select account</option>
                    {state.accounts
                      .filter((a) => a.status === 'ready')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.provider})
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Objective
                  <textarea
                    name="objective"
                    rows={5}
                    required
                    placeholder="Describe what you want the team to build…"
                  />
                </label>
                <p>
                  A read-only coordinator will inspect the repository and submit
                  a task plan. Mock accounts do not generate real plans.
                </p>
                <button className="primary">Start planning</button>
              </form>
            )}
            {(dialog === 'delegate' || dialog === 'new-task') && (
              <form
                onSubmit={(e) => {
                  const v = form(e);
                  void act(async () => {
                    if (dialog === 'delegate') {
                      if (!selected)
                        throw new Error('Select a parent task first');
                      await api(`/agents/${selected.agentId}/delegate`, v);
                    } else await api('/tasks', v);
                    setDialog(undefined);
                  });
                }}
              >
                {dialog === 'new-task' && (
                  <>
                    <label>
                      Project
                      <select name="projectId" required>
                        {state.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Account
                      <select name="accountId" required>
                        {state.accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Permissions
                      <select name="permissions">
                        <option value="workspace-write">
                          Write in isolated worktree
                        </option>
                        <option value="read-only">Read-only research</option>
                      </select>
                    </label>
                  </>
                )}
                <label>
                  Role
                  <input name="role" required placeholder="e.g. testing" />
                </label>
                <label>
                  Task title
                  <input name="title" required />
                </label>
                <label>
                  Instructions
                  <textarea name="prompt" rows={5} required />
                </label>
                <button className="primary">
                  {dialog === 'delegate'
                    ? 'Delegate with inherited permissions'
                    : 'Queue task'}
                </button>
              </form>
            )}
            {dialog === 'message' && (
              <form
                onSubmit={(e) => {
                  const v = form(e);
                  void act(async () => {
                    await api('/messages', v);
                    setDialog(undefined);
                  });
                }}
              >
                <label>
                  From
                  <select name="sender" required>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.role} · {label(a.projectId)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  To
                  <select name="recipient" required>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.role} · {label(a.projectId)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <select name="type">
                    {[
                      'DISCOVERY',
                      'NEED_DEPENDENCY',
                      'DEPENDENCY_READY',
                      'REQUEST_REVIEW',
                      'REVIEW_RESULT',
                      'HELP_REQUEST',
                      'DECISION_REQUEST',
                      'DECISION_RESOLVED',
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Message
                  <textarea name="payload" required rows={4} />
                </label>
                <button className="primary">Queue message</button>
              </form>
            )}
            {dialog === 'note' && (
              <form
                onSubmit={(e) => {
                  const v = form(e);
                  void act(async () => {
                    await api(`/knowledge/${projectId}`, v);
                    setNotes(await api(`/knowledge/${projectId}`));
                    setDialog(undefined);
                  });
                }}
              >
                <label>
                  Title
                  <input name="title" required />
                </label>
                <label>
                  Note
                  <textarea name="body" required rows={8} />
                </label>
                <p>
                  Save curated knowledge only. Do not paste credentials or
                  private logs.
                </p>
                <button className="primary">Save Markdown note</button>
              </form>
            )}
            {dialog === 'task' && currentTask && (
              <>
                {badge(currentTask.status)}
                <p>{currentTask.prompt}</p>
                <label>
                  Worktree
                  <code>
                    {currentTask.worktree || 'Created when scheduled'}
                  </code>
                </label>
                <label>
                  Branch<code>{currentTask.branch || 'Not started'}</code>
                </label>
                {currentTask.error && (
                  <div className="alert error">{currentTask.error}</div>
                )}
                <pre>{currentTask.output || 'No output yet.'}</pre>
                <div className="actions">
                  <button
                    onClick={() =>
                      void act(async () => {
                        const d = await api(`/tasks/${currentTask.id}/diff`);
                        setNotice(JSON.stringify(d));
                      })
                    }
                  >
                    Inspect change summary
                  </button>
                  {['blocked', 'failed', 'interrupted'].includes(
                    currentTask.status,
                  ) && (
                    <button
                      onClick={() =>
                        void act(() =>
                          api(`/tasks/${currentTask.id}/resume`, {}),
                        )
                      }
                    >
                      Resume task
                    </button>
                  )}
                  {currentTask.status === 'running' && (
                    <button
                      onClick={() =>
                        void act(() => api(`/tasks/${currentTask.id}/stop`, {}))
                      }
                    >
                      Stop task
                    </button>
                  )}
                  {currentTask.status === 'completed' && (
                    <>
                      <button
                        onClick={() =>
                          void act(
                            () => api(`/tasks/${currentTask.id}/commit`, {}),
                            'Changes committed locally.',
                          )
                        }
                      >
                        Commit locally
                      </button>
                      <button
                        onClick={() => {
                          setDialog(undefined);
                          void act(
                            () => api(`/tasks/${currentTask.id}/pr`, {}),
                            'Draft pull request created.',
                          );
                        }}
                      >
                        Request draft PR
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span>◇</span>
      <p>{text}</p>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
