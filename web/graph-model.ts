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
export function graphLayout(nodes: GraphNode[]): Record<string, Point> {
  const accounts = nodes.filter((n) => n.kind === 'account');
  const points: Record<string, Point> = accountAnchors(
    accounts.map((a) => a.id),
  );
  for (const node of nodes) {
    if (node.kind === 'repository') points[node.id] = { ...graphCenter };
    if (node.kind === 'project')
      points[node.id] = { x: graphCenter.x, y: graphCenter.y - 65 };
  }
  const groups = new Map<string, GraphNode[]>();
  for (const node of nodes.filter(
    (n) => !['account', 'repository', 'project'].includes(n.kind),
  )) {
    const key = JSON.stringify([node.accountId || '', node.kind]);
    groups.set(key, [...(groups.get(key) || []), node]);
  }
  for (const group of groups.values()) {
    const anchor = group[0].accountId ? points[group[0].accountId] : undefined;
    const baseAngle = anchor
      ? Math.atan2(anchor.y - graphCenter.y, anchor.x - graphCenter.x)
      : 0;
    const sector = Math.min(
      1.6,
      ((Math.PI * 2) / Math.max(1, accounts.length)) * 0.75,
    );
    group.forEach((node, i) => {
      const angle =
        baseAngle +
        (i - (group.length - 1) / 2) *
          Math.min(0.25, sector / Math.max(1, group.length - 1));
      const baseRadius = { agent: 245, task: 165, branch: 95, file: 275 }[
        node.kind as 'agent' | 'task' | 'branch' | 'file'
      ];
      const radius = Math.min(310, baseRadius + (i % 2 ? 9 : -9));
      points[node.id] = {
        x: graphCenter.x + Math.cos(angle) * radius,
        y: graphCenter.y + Math.sin(angle) * radius,
      };
    });
  }
  return points;
}
export function viewToWorld(point: Point, pan: Point, scale: number): Point {
  return {
    x: (point.x - pan.x - graphCenter.x) / scale + graphCenter.x,
    y: (point.y - pan.y - graphCenter.y) / scale + graphCenter.y,
  };
}
