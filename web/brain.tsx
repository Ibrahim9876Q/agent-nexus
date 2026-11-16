import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { State } from './main';
import { api } from './api';
import {
  graphCenter,
  graphKinds,
  graphLayout,
  curvedLink,
  viewToWorld,
  workspaceGraph,
  type Contribution,
  type GraphKind,
  type Point,
} from './graph-model';

type Preferences = {
  positions: Record<string, Point>;
  offsets: Record<string, Point>;
  labels: Record<GraphKind, boolean>;
};
const originPoint = { x: 0, y: 0 };
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const subtract = (a: Point, b: Point): Point => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
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
    const points = (entries: unknown) =>
      Object.fromEntries(
        Object.entries(entries || {}).filter(
          ([, p]: [string, any]) =>
            p &&
            Number.isFinite(p.x) &&
            Number.isFinite(p.y) &&
            Math.abs(p.x) < 1e7 &&
            Math.abs(p.y) < 1e7,
        ),
      ) as Record<string, Point>;
    const labels = Object.fromEntries(
      graphKinds.map((kind) => [
        kind,
        typeof value.labels?.[kind] === 'boolean'
          ? value.labels[kind]
          : defaultLabels[kind],
      ]),
    ) as Preferences['labels'];
    // Old freeform positions would hide the new cluster layout.
    return {
      positions: points(value.version === 2 && value.positions),
      offsets: points(value.version === 2 && value.offsets),
      labels,
    };
  } catch {
    return { positions: {}, offsets: {}, labels: { ...defaultLabels } };
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
  const [placement, setPlacement] = useState({
    positions: saved.positions,
    offsets: saved.offsets,
  });
  const placementRef = useRef(placement);
  const [labels, setLabels] = useState(saved.labels);
  const [controlsOpen, setControlsOpen] = useState(
    () => window.innerWidth > 1050,
  );
  const [selectedId, setSelectedId] = useState('');
  const [hoveredId, setHoveredId] = useState('');
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const glowId = useId();
  const drag = useRef<
    | {
        pointer: number;
        id?: string;
        cluster?: string;
        start: Point;
        origin: Point;
        moved: boolean;
      }
    | undefined
  >(undefined);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const signature = state.tasks
    .filter((t) => t.projectId === projectId)
    .map((t) => t.id + ':' + t.status)
    .join();
  useEffect(() => {
    let dead = false;
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
  const topology = graph.nodes.map((n) => [
    n.id,
    n.kind,
    n.currentTaskId,
    n.kind === 'task' ? n.label : '',
  ]);
  const layoutKey = JSON.stringify([
    topology,
    graph.edges.filter((edge) =>
      ['owns', 'contributes', 'changed', 'scope'].includes(edge.kind),
    ),
  ]);
  const layout = useMemo(
    () => graphLayout(graph.nodes, graph.edges),
    [layoutKey],
  );
  const clusterById = new Map(
    layout.clusters.map((cluster) => [cluster.id, cluster]),
  );
  const clusterOffset = (id?: string) =>
    (id && placement.offsets[id]) || originPoint;
  const positions = Object.fromEntries(
    graph.nodes.map((node) => [
      node.id,
      add(
        placement.positions[node.id] || layout.positions[node.id],
        clusterOffset(layout.clusterFor.get(node.id)),
      ),
    ]),
  );
  const zoom = scale * layout.fitScale;
  const selected = graph.nodes.find((n) => n.id === selectedId);
  function persist(names = labels) {
    try {
      localStorage.setItem(
        'nexus-brain-' + projectId,
        JSON.stringify({ version: 2, ...placementRef.current, labels: names }),
      );
    } catch {}
  }
  function moveNode(id: string, point: Point) {
    const current = placementRef.current;
    const cluster = layout.clusterFor.get(id);
    placementRef.current = {
      ...current,
      positions: {
        ...current.positions,
        [id]: subtract(
          point,
          (cluster && current.offsets[cluster]) || originPoint,
        ),
      },
    };
    setPlacement(placementRef.current);
  }
  function moveCluster(id: string, point: Point) {
    const current = placementRef.current;
    placementRef.current = {
      ...current,
      offsets: { ...current.offsets, [id]: point },
    };
    setPlacement(placementRef.current);
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
    persist(next);
  }
  return (
    <div className="brain">
      <div className="graph-toolbar">
        <div>
          <strong>Workspace brain</strong>
          <small>
            {layout.clusters.length} task clusters · {graph.nodes.length}{' '}
            connected records
          </small>
        </div>
        <button
          onClick={() => {
            placementRef.current = { positions: {}, offsets: {} };
            setPlacement(placementRef.current);
            setScale(1);
            setPan({ x: 0, y: 0 });
            persist();
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
              if (e.button !== 0 || drag.current) return;
              const point = viewPoint(e);
              if (!point) return;
              const id =
                (e.target as Element)
                  .closest('[data-node-id]')
                  ?.getAttribute('data-node-id') || undefined;
              const cluster = id
                ? e.shiftKey
                  ? layout.clusterFor.get(id)
                  : undefined
                : (e.target as Element)
                    .closest('[data-cluster-id]')
                    ?.getAttribute('data-cluster-id') || undefined;
              if (id || cluster) setSelectedId(id || cluster!);
              drag.current = {
                pointer: e.pointerId,
                id,
                cluster,
                start: id || cluster ? viewToWorld(point, pan, zoom) : point,
                origin: cluster
                  ? clusterOffset(cluster)
                  : id
                    ? positions[id]
                    : pan,
                moved: false,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const active = drag.current;
              const point = viewPoint(e);
              if (!active || active.pointer !== e.pointerId || !point) return;
              const next =
                active.id || active.cluster
                  ? viewToWorld(point, pan, zoom)
                  : point;
              const dx = next.x - active.start.x,
                dy = next.y - active.start.y;
              if (Math.abs(dx) + Math.abs(dy) > 2) active.moved = true;
              if (active.cluster)
                moveCluster(active.cluster, {
                  x: active.origin.x + dx,
                  y: active.origin.y + dy,
                });
              else if (active.id)
                moveNode(active.id, {
                  x: active.origin.x + dx,
                  y: active.origin.y + dy,
                });
              else setPan({ x: active.origin.x + dx, y: active.origin.y + dy });
            }}
            onPointerUp={(e) => {
              const active = drag.current;
              if (!active || active.pointer !== e.pointerId) return;
              if (active.id || active.cluster) {
                persist();
                if (!active.moved) setControlsOpen(true);
              }
              drag.current = undefined;
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={(e) => {
              if (drag.current?.pointer !== e.pointerId) return;
              if (drag.current.id || drag.current.cluster) persist();
              drag.current = undefined;
            }}
            onLostPointerCapture={(e) => {
              if (drag.current?.pointer !== e.pointerId) return;
              if (drag.current.id || drag.current.cluster) persist();
              drag.current = undefined;
            }}
          >
            <defs>
              <radialGradient id={glowId}>
                <stop offset="0%" stopColor="white" />
                <stop offset="57%" stopColor="white" stopOpacity=".58" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
              {layout.clusters.map((cluster, i) => (
                <radialGradient key={cluster.id} id={glowId + '-lobe-' + i}>
                  <stop
                    offset="0%"
                    stopColor={cluster.color}
                    stopOpacity=".14"
                  />
                  <stop
                    offset="60%"
                    stopColor={cluster.color}
                    stopOpacity=".075"
                  />
                  <stop
                    offset="100%"
                    stopColor={cluster.color}
                    stopOpacity="0"
                  />
                </radialGradient>
              ))}
            </defs>
            <g
              transform={`translate(${pan.x} ${pan.y}) translate(${graphCenter.x} ${graphCenter.y}) scale(${zoom}) translate(${-graphCenter.x} ${-graphCenter.y})`}
            >
              {layout.clusters.map((cluster, i) => {
                const center = add(cluster.center, clusterOffset(cluster.id));
                return (
                  <circle
                    className="cluster-halo"
                    key={cluster.id}
                    data-cluster-id={cluster.id}
                    cx={center.x}
                    cy={center.y}
                    r={cluster.radius}
                    fill={`url(#${glowId}-lobe-${i})`}
                  >
                    <title>{cluster.label} · drag to move cluster</title>
                  </circle>
                );
              })}
              {graph.edges.map((edge) => {
                const from = layout.clusterFor.get(edge.source),
                  to = layout.clusterFor.get(edge.target);
                const focus = hoveredId || selectedId;
                const related = focus === edge.source || focus === edge.target;
                const local = !!from && from === to;
                return (
                  <path
                    className={
                      'edge ' +
                      (local ? 'inside' : 'across') +
                      (related ? ' related' : '')
                    }
                    key={JSON.stringify(edge)}
                    style={{
                      color: local ? clusterById.get(from)?.color : undefined,
                    }}
                    d={curvedLink(
                      positions[edge.source],
                      positions[edge.target],
                    )}
                  />
                );
              })}
              {graph.nodes.map((node) => {
                const point = positions[node.id];
                const cluster = clusterById.get(
                  layout.clusterFor.get(node.id) || '',
                );
                const radius = {
                  repository: 12,
                  project: 7,
                  account: 8,
                  task: 8,
                  agent: 5,
                  branch: 4.5,
                  file: 3.6,
                }[node.kind];
                return (
                  <g
                    key={node.id}
                    data-node-id={node.id}
                    className={
                      'graph-node ' +
                      node.kind +
                      (selectedId === node.id ? ' picked' : '')
                    }
                    style={{ color: cluster?.color }}
                    onPointerEnter={() => setHoveredId(node.id)}
                    onPointerLeave={() =>
                      setHoveredId((id) => (id === node.id ? '' : id))
                    }
                    onFocus={() => setHoveredId(node.id)}
                    onBlur={() => setHoveredId('')}
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
                        if (e.shiftKey && cluster)
                          moveCluster(
                            cluster.id,
                            add(clusterOffset(cluster.id), delta[e.key]),
                          );
                        else moveNode(node.id, add(point, delta[e.key]));
                        persist();
                      }
                    }}
                  >
                    <title>{node.kind + ': ' + node.label}</title>
                    <circle
                      className="node-hit-target"
                      cx={point.x}
                      cy={point.y}
                      r={radius + 5}
                    />
                    <circle
                      className="node-aura"
                      cx={point.x}
                      cy={point.y}
                      r={radius * 2.8}
                      fill={`url(#${glowId})`}
                    />
                    <circle
                      className="node-core"
                      cx={point.x}
                      cy={point.y}
                      r={radius}
                    />
                    {(labels[node.kind] ||
                      node.id === (hoveredId || selectedId)) && (
                      <text
                        x={point.x}
                        y={point.y + radius + 16}
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
            Drag a node or its cluster’s glow · drag empty space to pan · scroll
            to zoom <span>{Math.round(scale * 100)}%</span>
          </div>
        </div>
        {controlsOpen && (
          <aside
            className="graph-controls"
            id="brain-controls"
            aria-label="Brain names and details"
          >
            {layout.clusters.length > 0 && (
              <div className="graph-topics">
                <h3>Task clusters</h3>
                {layout.clusters.map((cluster) => (
                  <button
                    key={cluster.id}
                    type="button"
                    title={cluster.label}
                    aria-pressed={selectedId === cluster.id}
                    onClick={() => {
                      setSelectedId(cluster.id);
                      const point = positions[cluster.id];
                      setPan({
                        x: (graphCenter.x - point.x) * zoom,
                        y: (graphCenter.y - point.y) * zoom,
                      });
                    }}
                  >
                    <i style={{ color: cluster.color }} aria-hidden="true" />
                    <span>{cluster.label}</span>
                    <small>{cluster.nodeIds.length}</small>
                  </button>
                ))}
              </div>
            )}
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
