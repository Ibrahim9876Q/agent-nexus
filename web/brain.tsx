import { useEffect, useRef, useState } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
} from 'd3-force';
import type { State } from './main';
import { api } from './main';
type Node = SimulationNodeDatum & {
  id: string;
  label: string;
  kind: string;
  detail: string;
};
export function Brain({
  state: s,
  projectId,
  onAgent,
}: {
  state: State;
  projectId: string;
  onAgent: (id: string) => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([]),
    [edges, setEdges] = useState<
      { source: Node; target: Node; kind: string }[]
    >([]),
    [selected, setSelected] = useState<Node>(),
    [scale, setScale] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<
    { x: number; y: number; px: number; py: number } | undefined
  >(undefined);
  const [contributions, setContributions] = useState<
    { taskId: string; files: string[]; base: string }[]
  >([]);
  const signature = s.tasks.map((t) => t.id + ':' + t.status).join();
  useEffect(() => {
    let dead = false;
    setContributions([]);
    if (projectId)
      api(`/projects/${projectId}/contributions`)
        .then((result) => {
          if (!dead) setContributions(result);
        })
        .catch(() => {});
    return () => {
      dead = true;
    };
  }, [projectId, signature]);
  useEffect(() => {
    const ns: Node[] = [],
      ls: { source: string; target: string; kind: string }[] = [];
    const add = (id: string, label: string, kind: string, detail: string) =>
      ns.push({ id, label, kind, detail });
    const link = (source: string, target: string, kind: string) =>
      ls.push({ source, target, kind });
    const p = s.projects.find((p) => p.id === projectId);
    if (!p) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const repo = s.repos.find((r) => r.id === p.repoId)!;
    add(repo.id, repo.name, 'repository', repo.path);
    add(p.id, p.name, 'project', p.objective);
    link(repo.id, p.id, 'contains');
    for (const a of s.accounts.filter((a) =>
      s.agents.some((w) => w.projectId === p.id && w.accountId === a.id),
    )) {
      add(
        a.id,
        a.name,
        'account',
        `${a.provider} · ${a.status} · ${a.concurrency} slots`,
      );
      link(p.id, a.id, 'coordinates');
    }
    for (const a of s.agents.filter((a) => a.projectId === p.id)) {
      add(a.id, a.role, 'agent', `${a.kind} · ${a.status} · ${a.permissions}`);
      link(a.accountId, a.id, 'authenticates');
      if (a.parentId) link(a.parentId, a.id, 'delegates');
    }
    for (const t of s.tasks.filter((t) => t.projectId === p.id)) {
      add(t.id, t.title, 'task', `${t.status}\n${t.output || t.prompt}`);
      link(t.agentId, t.id, 'owns');
      for (const d of t.dependencies) link(d, t.id, 'prerequisite');
      if (t.branch) {
        const b = t.id + ':branch';
        add(b, t.branch, 'branch', t.worktree || '');
        link(t.id, b, 'contributes');
        link(b, repo.id, 'worktree of');
      }
      for (const scope of t.scope) {
        const f = repo.id + ':' + scope;
        if (!ns.some((n) => n.id === f))
          add(
            f,
            scope,
            'file',
            'Declared change scope; inspect Git diff to verify actual changes.',
          );
        link(t.id, f, 'scope');
      }
    }
    for (const c of contributions)
      for (const file of c.files) {
        const key = repo.id + ':' + file;
        if (!ns.some((n) => n.id === key))
          add(
            key,
            file,
            'file',
            `Git-observed change relative to repository HEAD ${c.base.slice(0, 8)}. Includes uncommitted and untracked files.`,
          );
        link(c.taskId, key, 'changed');
      }
    for (const m of s.messages.filter((m) => m.projectId === p.id))
      link(m.sender, m.recipient, 'communicates');
    const valid = ls.filter(
      (e) =>
        ns.some((n) => n.id === e.source) && ns.some((n) => n.id === e.target),
    );
    const sim = forceSimulation(ns)
      .force(
        'link',
        forceLink<Node, any>(valid)
          .id((n) => n.id)
          .distance(95),
      )
      .force('charge', forceManyBody().strength(-340))
      .force('center', forceCenter(480, 330))
      .force('collide', forceCollide(35))
      .stop();
    for (let i = 0; i < 180; i++) sim.tick();
    setNodes([...ns]);
    setEdges(valid as any);
    return () => {
      sim.stop();
    };
  }, [
    s.projects,
    s.repos,
    s.accounts,
    s.agents,
    s.tasks,
    s.messages,
    projectId,
    contributions,
  ]);
  return (
    <div className="brain">
      <div className="graph-toolbar">
        <div>
          <strong>Workspace graph</strong>
          <small>Actual ownership, delegation & Git relationships</small>
        </div>
        <button
          onClick={() => {
            setScale(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Reset view
        </button>
        <button onClick={() => setScale((v) => Math.min(3, v + 0.2))}>
          ＋
        </button>
        <button onClick={() => setScale((v) => Math.max(0.3, v - 0.2))}>
          −
        </button>
      </div>
      <div
        className="graph-canvas"
        onWheel={(e) =>
          setScale((v) => Math.max(0.3, Math.min(3, v - e.deltaY * 0.001)))
        }
      >
        <svg
          viewBox="0 0 960 660"
          onPointerDown={(e) => {
            if ((e.target as Element).tagName === 'svg') {
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                px: pan.x,
                py: pan.y,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }}
          onPointerMove={(e) => {
            if (drag.current)
              setPan({
                x: drag.current.px + (e.clientX - drag.current.x),
                y: drag.current.py + (e.clientY - drag.current.y),
              });
          }}
          onPointerUp={() => {
            drag.current = undefined;
          }}
        >
          <g
            transform={`translate(${pan.x} ${pan.y}) translate(480 330) scale(${scale}) translate(-480 -330)`}
          >
            {edges.map((e, i) => (
              <line
                key={i}
                className={'edge ' + e.kind}
                x1={e.source.x}
                y1={e.source.y}
                x2={e.target.x}
                y2={e.target.y}
              >
                <title>{e.kind}</title>
              </line>
            ))}
            {nodes.map((n) => (
              <g
                key={n.id}
                className={
                  'graph-node ' +
                  n.kind +
                  (selected?.id === n.id ? ' picked' : '')
                }
                onClick={() => setSelected(n)}
                role="button"
                tabIndex={0}
                aria-label={`${n.kind}: ${n.label}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setSelected(n);
                }}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={
                    n.kind === 'repository' ? 13 : n.kind === 'account' ? 10 : 7
                  }
                />
                <text x={n.x} y={(n.y || 0) + 25} textAnchor="middle">
                  {n.label.length > 30 ? n.label.slice(0, 28) + '…' : n.label}
                </text>
              </g>
            ))}
          </g>
        </svg>
        {!nodes.length && (
          <div className="graph-empty">
            Create a project to build its connected brain.
            <br />
            Nodes appear from real workspace records.
          </div>
        )}
      </div>
      <div className="graph-legend">
        {[
          'repository',
          'project',
          'account',
          'agent',
          'task',
          'branch',
          'file',
        ].map((k) => (
          <span className={k} key={k}>
            ● {k}
          </span>
        ))}
        <small>
          Drag canvas to pan · scroll to zoom · click a node to inspect
        </small>
      </div>
      {selected && (
        <aside className="graph-inspector">
          <button onClick={() => setSelected(undefined)}>×</button>
          <span>{selected.kind.toUpperCase()}</span>
          <h2>{selected.label}</h2>
          <pre>{selected.detail}</pre>
          {selected.kind === 'agent' && (
            <button onClick={() => onAgent(selected.id)}>
              Open worker stream →
            </button>
          )}
          <h3>Connections</h3>
          {edges
            .filter(
              (e) => e.source.id === selected.id || e.target.id === selected.id,
            )
            .map((e, i) => (
              <p key={i}>
                {e.source.label} → {e.kind} → {e.target.label}
              </p>
            ))}
        </aside>
      )}
    </div>
  );
}
