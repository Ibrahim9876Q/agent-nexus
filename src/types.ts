export type ModelOption = {
  id: string;
  model: string;
  displayName: string;
  description?: string;
  isDefault?: boolean;
  hidden?: boolean;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[];
};
export type ApprovalMode = 'ask' | 'auto' | 'full';
export type TokenUsage = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};
export type Account = {
  model?: string | null;
  effort?: string | null;
  approvalMode?: ApprovalMode;
  models?: ModelOption[];
  modelsError?: string;
  enabled?: boolean;
  cooldownUntil?: number;
  capacity?: {
    primary?: {
      usedPercent: number;
      windowDurationMins?: number | null;
      resetsAt?: number | null;
    };
    secondary?: {
      usedPercent: number;
      windowDurationMins?: number | null;
      resetsAt?: number | null;
    };
    observedAt: number;
  };
  capacityError?: string;
  id: string;
  name: string;
  provider: 'mock' | 'codex';
  status: string;
  concurrency: number;
  nativeLimit: number;
  maxDepth: number;
  maxAgents: number;
  detail?: string;
};
export type Repo = { id: string; name: string; path: string };
export type Project = {
  coordinatorAccountId?: string;
  id: string;
  repoId: string;
  name: string;
  objective: string;
  status: 'active' | 'paused';
};
export type Agent = {
  id: string;
  accountId: string;
  projectId: string;
  parentId?: string;
  role: string;
  depth: number;
  status: string;
  kind: 'worker' | 'worker-delegation';
  permissions: 'read-only' | 'workspace-write';
  threadId?: string;
  taskId?: string;
  tokenUsageTotal?: TokenUsage;
};
export type Task = {
  commandId?: string;
  parentTaskId?: string;
  execution?: { model?: string; effort?: string; approvalMode: ApprovalMode };
  responseItems?: { id: string; text: string; phase?: string }[];
  reasoningSummary?: string;
  reasoningSummaries?: { id: string; parts: string[] }[];
  usageByTurn?: Record<string, TokenUsage>;
  usageBaselines?: Record<string, TokenUsage>;
  turnIds?: string[];
  activity?: {
    id: string;
    kind: 'command' | 'file' | 'tool';
    label: string;
    status: string;
    at: number;
    exitCode?: number | null;
    durationMs?: number | null;
  }[];
  id: string;
  projectId: string;
  agentId: string;
  title: string;
  prompt: string;
  dependencies: string[];
  scope: string[];
  priority: number;
  status:
    'pending' | 'running' | 'blocked' | 'completed' | 'failed' | 'interrupted';
  attempts: number;
  worktree?: string;
  branch?: string;
  output?: string;
  error?: string;
  heartbeat?: number;
};
export type Message = {
  id: string;
  sender: string;
  recipient: string;
  projectId: string;
  repoId: string;
  taskId?: string;
  type: string;
  timestamp: string;
  correlationId: string;
  payload: unknown;
  dedupeKey: string;
};
export type Delivery = {
  id: string;
  messageId: string;
  recipient: string;
  status: 'queued' | 'delivered' | 'acknowledged' | 'expired';
  attempts: number;
  nextAttempt: number;
  expiresAt: number;
};
export type Approval = {
  id: string;
  kind: string;
  description: string;
  detail: unknown;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  taskId?: string;
};
export type Event = { id: string; at: string; type: string; data: unknown };
export interface Tables {
  commands: {
    id: string;
    projectId: string;
    text: string;
    mode: string;
    at: string;
    targets: string[];
    result: string;
    taskIds?: string[];
  };
  accounts: Account;
  repos: Repo;
  projects: Project;
  agents: Agent;
  tasks: Task;
  messages: Message;
  deliveries: Delivery;
  approvals: Approval;
  events: Event;
}
