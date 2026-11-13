export type ModelOption = {
  inputModalities?: string[];
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
  email?: string;
  usageBlockedAt?: number;
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
export type Chat = {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  legacy?: boolean;
};
export type Attachment = {
  id: string;
  projectId: string;
  chatId: string;
  name: string;
  mime: string;
  size: number;
  path: string;
  createdAt: string;
};
export type Project = {
  autoResumeUsage?: boolean;
  autoHandoffUsage?: boolean;
  pauseReason?: 'user' | 'restart';
  coordinatorAccountId?: string;
  id: string;
  repoId: string;
  name: string;
  objective: string;
  status: 'active' | 'paused';
};
export type Agent = {
  chatId?: string;
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
  quotaRecovery?: {
    state: 'stopping' | 'waiting';
    reason: string;
    checkpoint?: string;
    error?: string;
  };
  handoffContext?: string;
  approvalCeiling?: ApprovalMode;
  handoffs?: {
    fromAccountId: string;
    toAccountId: string;
    at: string;
    checkpoint: string;
    tokens?: number;
    model?: string;
    effort?: string;
    used?: boolean;
  }[];
  attachmentIds?: string[];
  replyCommandId?: string;
  recoveryHold?: boolean;
  waitingReason?: string;
  runtimeStage?: string;
  nextInput?: string;
  turnActive?: boolean;
  reportedBlock?: string;
  chatId?: string;
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
  commandId?: string;
  senderAccountId?: string;
  recipientAccountId?: string;
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
export type ChatReply = {
  accountId?: string;
  legacyMissing?: boolean;
  text: string;
  state:
    | 'queued'
    | 'thinking'
    | 'waiting'
    | 'completed'
    | 'failed'
    | 'interrupted'
    | 'paused';
  reasoningSummary?: string;
  progress?: string[];
  error?: string;
  updatedAt: string;
  kind?: 'status' | 'assistant';
};
export interface Tables {
  commands: {
    autoTeam?: boolean;
    teamPlan?: { leadTask: string; rationale: string; workerTaskIds: string[] };
    teamReviewStarted?: boolean;
    attachmentIds?: string[];
    reply?: ChatReply;
    queued?: boolean;
    chatId?: string;
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
  attachments: Attachment;
  chats: Chat;
  repos: Repo;
  projects: Project;
  agents: Agent;
  tasks: Task;
  messages: Message;
  deliveries: Delivery;
  approvals: Approval;
  events: Event;
}
