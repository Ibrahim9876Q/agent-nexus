import type {
  Account,
  Agent,
  Message,
  Project,
  Repo,
  Task,
} from '../src/types';

export const graphKinds = [
  'repository',
  'project',
  'account',
  'agent',
  'task',
  'branch',
  'file',
] as const;
export type GraphKind = (typeof graphKinds)[number];
export type GraphNode = {
  id: string;
  label: string;
  kind: GraphKind;
  detail: string;
  accountId?: string;
  currentTaskId?: string;
};
export type GraphEdge = { source: string; target: string; kind: string };
export type Point = { x: number; y: number };
export type Contribution = { taskId: string; files: string[]; base: string };
type GraphState = {
  accounts: Account[];
  agents: Agent[];
  tasks: Task[];
  repos: Repo[];
  projects: Project[];
  messages: Message[];
};
export const graphCenter = { x: 600, y: 450 };

export function workspaceGraph(
  state: GraphState,
  projectId: string,
  contributions: Contribution[],
) {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const add = (node: GraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const link = (source: string, target: string, kind: string) =>
    edges.set(JSON.stringify([source, target, kind]), { source, target, kind });
  const project = state.projects.find((p) => p.id === projectId);
  const repo = state.repos.find((r) => r.id === project?.repoId);
  if (!project || !repo) return { nodes: [], edges: [] };
  add({ id: repo.id, label: repo.name, kind: 'repository', detail: repo.path });
  add({
    id: project.id,
    label: project.name,
    kind: 'project',
    detail: project.objective,
  });
  link(repo.id, project.id, 'contains');
  for (const account of state.accounts) {
    add({
      id: account.id,
      label: account.name,
      kind: 'account',
      detail: `${account.provider} · ${account.status} · ${account.concurrency} execution slots`,
      accountId: account.id,
    });
    link(repo.id, account.id, 'available account');
  }
  const agents = state.agents.filter((a) => a.projectId === project.id);
  const tasks = state.tasks.filter((t) => t.projectId === project.id);
  for (const agent of agents) {
    add({
      id: agent.id,
      label: agent.role,
      kind: 'agent',
      detail: `${agent.kind} · ${agent.status} · ${agent.permissions}`,
      accountId: agent.accountId,
      currentTaskId: agent.taskId,
    });
    link(agent.accountId, agent.id, 'authenticates');
    if (agent.parentId) link(agent.parentId, agent.id, 'delegates');
  }
  const fileNode = (
    task: Task,
    file: string,
    detail: string,
    relationship: string,
  ) => {
    const fileId = repo.id + ':file:' + file;
    add({
      id: fileId,
      label: file,
      kind: 'file',
      detail,
      accountId: agents.find((a) => a.id === task.agentId)?.accountId,
    });
    link(task.id, fileId, relationship);
  };
  for (const task of tasks) {
    const accountId = agents.find((a) => a.id === task.agentId)?.accountId;
    add({
      id: task.id,
      label: task.title,
      kind: 'task',
      detail: `${task.status}\n${task.output || task.prompt}`,
      accountId,
    });
    link(task.agentId, task.id, 'owns');
    for (const dependency of task.dependencies)
      link(dependency, task.id, 'prerequisite');
    if (task.parentTaskId) link(task.parentTaskId, task.id, 'assigns');
    if (task.branch) {
      const branchId = repo.id + ':branch:' + task.branch;
      add({
        id: branchId,
        label: task.branch,
        kind: 'branch',
        detail: task.worktree || '',
        accountId,
      });
      link(task.id, branchId, 'contributes');
      link(branchId, repo.id, 'worktree of');
    }
    for (const scope of task.scope)
      fileNode(
        task,
        scope,
        'Declared change scope; inspect Git to verify changes.',
        'scope',
      );
  }
  for (const contribution of contributions) {
    const task = tasks.find((t) => t.id === contribution.taskId);
    if (!task) continue;
    for (const file of contribution.files)
      fileNode(
        task,
        file,
        `Git-observed change relative to HEAD ${contribution.base.slice(0, 8)}. Includes uncommitted and untracked files.`,
        'changed',
      );
  }
  for (const message of state.messages.filter(
    (m) => m.projectId === project.id,
  ))
    link(message.sender, message.recipient, 'communicates');
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()].filter(
      (e) => nodes.has(e.source) && nodes.has(e.target),
    ),
  };
}

export function accountAnchors(
  ids: string[],
  radius = 330,
): Record<string, Point> {
  // Two accounts form a vertical line; four form an axis-aligned square.
  const start = ids.length === 4 ? -Math.PI / 4 : -Math.PI / 2;
  return Object.fromEntries(
    ids.map((id, i) => {
      const angle = start + (i * 2 * Math.PI) / ids.length;
      return [
        id,
        {
          x: graphCenter.x + Math.cos(angle) * radius,
          y: graphCenter.y + Math.sin(angle) * radius,
        },
      ];
    }),
  );
}
export type TaskCluster = {
  id: string;
  label: string;
  center: Point;
  radius: number;
  color: string;
  nodeIds: string[];
};
const hues = [
  '#79e9c9',
  '#efbb78',
  '#bba6ff',
  '#7bbdff',
  '#ffa5b9',
  '#b8db87',
  '#79dce8',
  '#ed9cea',
];
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
const around = (center: Point, r: number, angle: number): Point => ({
  x: center.x + r * Math.cos(angle),
  y: center.y + r * Math.sin(angle),
});
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function graphLayout(nodes: GraphNode[], edges: GraphEdge[]) {
  const points: Record<string, Point> = Object.create(null);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const tasks = nodes.filter((node) => node.kind === 'task');
  const clusterFor = new Map<string, string>();
  const claim = (nodeId: string, taskId: string) => {
    if (!clusterFor.has(nodeId) && byId.get(taskId)?.kind === 'task')
      clusterFor.set(nodeId, taskId);
  };
  for (const node of nodes) {
    if (node.kind === 'task') claim(node.id, node.id);
    if (node.kind === 'agent' && node.currentTaskId)
      claim(node.id, node.currentTaskId);
    if (node.kind === 'repository') points[node.id] = { ...graphCenter };
    if (node.kind === 'project')
      points[node.id] = { x: graphCenter.x, y: graphCenter.y - 58 };
  }
  // A file or branch shared by tasks still has one bubble. Prefer an observed
  // change to a declared scope; keep all the other task links to that bubble.
  for (const edge of edges) {
    if (edge.kind === 'owns') claim(edge.source, edge.target);
    if (['changed', 'contributes'].includes(edge.kind))
      claim(edge.target, edge.source);
  }
  for (const edge of edges)
    if (edge.kind === 'scope') claim(edge.target, edge.source);
  const members = new Map<string, GraphNode[]>(
    tasks.map((task) => [task.id, []]),
  );
  for (const node of nodes) {
    if (node.kind !== 'task')
      members.get(clusterFor.get(node.id) || '')?.push(node);
  }
  const clusters: TaskCluster[] = [];
  let cursor = 0,
    extent = 110;
  for (const task of tasks) {
    const group = members.get(task.id)!;
    const radius = 30 + 9 * Math.sqrt(group.length);
    let center: Point;
    do {
      cursor++;
      center = around(
        graphCenter,
        31 * Math.sqrt(cursor),
        goldenAngle * cursor - Math.PI / 2,
      );
    } while (
      distance(graphCenter, center) < radius + 94 ||
      clusters.some(
        (prior) => distance(center, prior.center) < radius + prior.radius + 24,
      )
    );
    points[task.id] = center;
    group.forEach((node, i) => {
      // A sunflower distribution makes a round, evenly spaced cloud without rings of labels.
      points[node.id] = around(
        center,
        14 + 8 * Math.sqrt(i + 0.5),
        goldenAngle * i + cursor,
      );
    });
    clusters.push({
      id: task.id,
      label: task.label,
      center,
      radius,
      color: hues[clusters.length % hues.length],
      nodeIds: [task.id, ...group.map((node) => node.id)],
    });
    extent = Math.max(extent, distance(graphCenter, center) + radius);
  }
  const accounts = nodes.filter((node) => node.kind === 'account');
  const accountRadius = Math.max(330, extent + 60);
  Object.assign(
    points,
    accountAnchors(
      accounts.map((node) => node.id),
      accountRadius,
    ),
  );
  const loose = nodes.filter((node) => !points[node.id]);
  loose.forEach((node, i) => {
    points[node.id] = around(graphCenter, accountRadius - 25, goldenAngle * i);
  });
  // Preserve world-space spacing on large projects and zoom out to fit the canvas.
  const fitScale = Math.min(1, 370 / accountRadius);
  return { positions: points, clusters, clusterFor, fitScale };
}

export function curvedLink(source: Point, target: Point, direction = 1) {
  const dx = target.x - source.x,
    dy = target.y - source.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const bow = Math.min(52, length * 0.13) * direction;
  const x = (source.x + target.x) / 2 - (dy / length) * bow;
  const y = (source.y + target.y) / 2 + (dx / length) * bow;
  return `M ${source.x} ${source.y} Q ${x} ${y} ${target.x} ${target.y}`;
}

export function viewToWorld(point: Point, pan: Point, scale: number): Point {
  return {
    x: (point.x - pan.x - graphCenter.x) / scale + graphCenter.x,
    y: (point.y - pan.y - graphCenter.y) / scale + graphCenter.y,
  };
}
