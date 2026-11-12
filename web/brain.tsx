import { useEffect, useMemo, useRef, useState } from 'react';
import type { State } from './main';
import { api } from './api';
import {
  graphCenter,
  graphKinds,
  graphLayout,
  viewToWorld,
  workspaceGraph,
  type Contribution,
  type GraphKind,
  type Point,
} from './graph-model';

type Preferences = {
  positions: Record<string, Point>;
  labels: Record<GraphKind, boolean>;
};
const defaultLabels = {
  repository: true,
  project: true,
  account: true,
  agent: false,
  task: false,
  branch: false,
  file: false,
};
function readPreferences(projectId: string): Preferences {
  try {
    const value = JSON.parse(
      localStorage.getItem('nexus-brain-' + projectId) || '{}',
    );
    const positions = Object.fromEntries(
      Object.entries(value.positions || {}).filter(
        ([, p]: [string, any]) =>
          p &&
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          Math.abs(p.x) < 1e7 &&
          Math.abs(p.y) < 1e7,
      ),
    );
    const labels = Object.fromEntries(
      graphKinds.map((kind) => [
        kind,
        typeof value.labels?.[kind] === 'boolean'
          ? value.labels[kind]
          : defaultLabels[kind],
      ]),
    ) as Preferences['labels'];
    return { positions: positions as Preferences['positions'], labels };
  } catch {
    return { positions: {}, labels: { ...defaultLabels } };
  }
}
export function Brain({
  state,
  projectId,
  onAgent,
}: {
  state: State;
  projectId: string;
  onAgent: (id: string) => void;
}) {
  const [saved] = useState(() => readPreferences(projectId));
  const [manual, setManual] = useState(saved.positions);
  const manualRef = useRef(manual);
  const [labels, setLabels] = useState(saved.labels);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<
    { id?: string; start: Point; origin: Point; moved: boolean } | undefined
  >(undefined);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const signature = state.tasks
    .filter((t) => t.projectId === projectId)
    .map((t) => t.id + ':' + t.status)
    .join();
  useEffect(() => {
    let dead = false;
    setContributions([]);
    if (projectId)
      api('/projects/' + projectId + '/contributions')
        .then((result) => {
          if (!dead) setContributions(result);
        })
        .catch(() => {});
    return () => {
      dead = true;
    };
  }, [projectId, signature]);
  const graph = useMemo(
    () => workspaceGraph(state, projectId, contributions),
    [state, projectId, contributions],
  );
  const topology = graph.nodes
    .map((n) => [n.id, n.kind, n.accountId].join(':'))
    .join('|');
  const layout = useMemo(() => graphLayout(graph.nodes), [topology]);
  const positions = { ...layout, ...manual };
  const selected = graph.nodes.find((n) => n.id === selectedId);
  const accounts = graph.nodes.filter((n) => n.kind === 'account');
  function persist(positions = manualRef.current, names = labels) {
    try {
      localStorage.setItem(
        'nexus-brain-' + projectId,
        JSON.stringify({ positions, labels: names }),
      );
    } catch {}
  }
  function moveNode(id: string, point: Point) {
    manualRef.current = { ...manualRef.current, [id]: point };
    setManual(manualRef.current);
  }
  function viewPoint(event: {
    clientX: number;
    clientY: number;
  }): Point | undefined {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  }
  function changeLabels(next: Preferences['labels']) {
    setLabels(next);
    persist(manualRef.current, next);
  }
  return (
    <div className="brain">
      <div className="graph-toolbar">
        <div>
          <strong>Workspace brain</strong>
          <small>Repository at the center · accounts on the outside</small>
        </div>
        <button
          onClick={() => {
            manualRef.current = {};
            setManual({});
            setScale(1);
            setPan({ x: 0, y: 0 });
            persist({});
          }}
        >
          Reset layout
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => setScale((v) => Math.min(3, v + 0.2))}
        >
          ＋
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => setScale((v) => Math.max(0.3, v - 0.2))}
        >
          −
        </button>
        <button
          aria-controls="brain-controls"
          aria-expanded={controlsOpen}
          onClick={() => setControlsOpen((v) => !v)}
        >
          Names & details
        </button>
      </div>
      <div className="brain-layout">
        <div
          className="graph-canvas"
          onWheel={(e) =>
            setScale((v) => Math.max(0.3, Math.min(3, v - e.deltaY * 0.001)))
          }
        >
          <svg
            ref={svgRef}
            viewBox="0 0 1200 900"
            aria-label="Interactive workspace graph"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const point = viewPoint(e);
              if (!point) return;
              const id =
                (e.target as Element)
                  .closest('[data-node-id]')
                  ?.getAttribute('data-node-id') || undefined;
              if (id) setSelectedId(id);
              drag.current = {
                id,
                start: id ? viewToWorld(point, pan, scale) : point,
                origin: id ? positions[id] : pan,
                moved: false,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const active = drag.current;
              const point = viewPoint(e);
              if (!active || !point) return;
              const next = active.id ? viewToWorld(point, pan, scale) : point;
              const dx = next.x - active.start.x,
                dy = next.y - active.start.y;
              if (Math.abs(dx) + Math.abs(dy) > 2) active.moved = true;
              if (active.id)
                moveNode(active.id, {
                  x: active.origin.x + dx,
                  y: active.origin.y + dy,
                });
              else setPan({ x: active.origin.x + dx, y: active.origin.y + dy });
            }}
            onPointerUp={(e) => {
              const active = drag.current;
              if (active?.id) {
                persist();
                if (!active.moved) setControlsOpen(true);
              }
              drag.current = undefined;
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => {
              if (drag.current?.id) persist();
              drag.current = undefined;
            }}
            onLostPointerCapture={() => {
              if (drag.current?.id) persist();
              drag.current = undefined;
            }}
          >
            <g
              transform={`translate(${pan.x} ${pan.y}) translate(${graphCenter.x} ${graphCenter.y}) scale(${scale}) translate(${-graphCenter.x} ${-graphCenter.y})`}
            >
              {accounts.length > 1 && (
                <polyline
                  className="account-orbit"
                  aria-hidden="true"
                  points={[
                    ...accounts,
                    ...(accounts.length > 2 ? [accounts[0]] : []),
                  ]
                    .map((a) => positions[a.id].x + ',' + positions[a.id].y)
                    .join(' ')}
                />
              )}
              {graph.edges.map((edge) => (
                <line
                  className={'edge ' + edge.kind}
                  key={JSON.stringify(edge)}
                  x1={positions[edge.source].x}
                  y1={positions[edge.source].y}
                  x2={positions[edge.target].x}
                  y2={positions[edge.target].y}
                >
                  <title>{edge.kind}</title>
                </line>
              ))}
              {graph.nodes.map((node) => {
                const point = positions[node.id];
                return (
                  <g
                    key={node.id}
                    data-node-id={node.id}
                    className={
                      'graph-node ' +
                      node.kind +
                      (selectedId === node.id ? ' picked' : '')
                    }
                    role="button"
                    tabIndex={0}
                    aria-label={node.kind + ': ' + node.label}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(node.id);
                        setControlsOpen(true);
                      }
                      const delta: Record<string, Point> = {
                        ArrowLeft: { x: -10, y: 0 },
                        ArrowRight: { x: 10, y: 0 },
                        ArrowUp: { x: 0, y: -10 },
                        ArrowDown: { x: 0, y: 10 },
                      };
                      if (delta[e.key]) {
                        e.preventDefault();
                        moveNode(node.id, {
                          x: point.x + delta[e.key].x,
                          y: point.y + delta[e.key].y,
                        });
                        persist();
                      }
                    }}
                  >
                    <title>{node.kind + ': ' + node.label}</title>
                    <circle
                      className="node-hit-target"
                      cx={point.x}
                      cy={point.y}
                      r="18"
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={
                        node.kind === 'repository'
                          ? 15
                          : node.kind === 'account'
                            ? 11
                            : 6
                      }
                    />
                    {labels[node.kind] && (
                      <text
                        x={point.x}
                        y={point.y + (node.kind === 'repository' ? 32 : 26)}
                        textAnchor="middle"
                      >
                        {node.label.length > 30
                          ? node.label.slice(0, 28) + '…'
                          : node.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
          {!graph.nodes.length && (
            <div className="graph-empty">
              Open a workspace to see its connected brain.
            </div>
          )}
          <div className="graph-help">
            Drag a bubble to move it · drag the background to pan · scroll to
            zoom <span>{Math.round(scale * 100)}%</span>
          </div>
        </div>
        {controlsOpen && (
          <aside
            className="graph-controls"
            id="brain-controls"
            aria-label="Brain names and details"
          >
            <h3>Visible names</h3>
            <p>Show or hide labels by type.</p>
            <div className="graph-label-actions">
              <button
                onClick={() =>
                  changeLabels(
                    Object.fromEntries(
                      graphKinds.map((k) => [k, true]),
                    ) as Preferences['labels'],
                  )
                }
              >
                Show all
              </button>
              <button
                onClick={() =>
                  changeLabels(
                    Object.fromEntries(
                      graphKinds.map((k) => [k, false]),
                    ) as Preferences['labels'],
                  )
                }
              >
                Hide all
              </button>
            </div>
            {graphKinds.map((kind) => (
              <label className="graph-name-toggle" key={kind}>
                <span className={'graph-key ' + kind}>●</span>
                <span>{kind}</span>
                <small>
                  {graph.nodes.filter((n) => n.kind === kind).length}
                </small>
                <input
                  type="checkbox"
                  aria-label={'Show ' + kind + ' names'}
                  checked={labels[kind]}
                  onChange={(e) =>
                    changeLabels({ ...labels, [kind]: e.target.checked })
                  }
                />
              </label>
            ))}
            {selected && (
              <div className="graph-node-details">
                <div className="graph-details-heading">
                  <h3>Node details</h3>
                  <button
                    aria-label="Close node details"
                    onClick={() => setSelectedId('')}
                  >
                    ×
                  </button>
                </div>
                <small>{selected.kind}</small>
                <h4>{selected.label}</h4>
                <pre>{selected.detail}</pre>
                {selected.kind === 'agent' && (
                  <button onClick={() => onAgent(selected.id)}>
                    Open worker stream →
                  </button>
                )}
                <h3>Connections</h3>
                {graph.edges
                  .filter(
                    (e) => e.source === selected.id || e.target === selected.id,
                  )
                  .map((e) => (
                    <p key={JSON.stringify(e)}>
                      {graph.nodes.find((n) => n.id === e.source)?.label} →{' '}
                      {e.kind} →{' '}
                      {graph.nodes.find((n) => n.id === e.target)?.label}
                    </p>
                  ))}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
