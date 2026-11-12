import type { Tables } from './types.ts';
import { admissionReason } from './account-capacity.ts';
import { isWorkRequest } from './continuation.ts';
type ActivityState = {
  chats: Tables['chats'][];
  projects: Tables['projects'][];
  tasks: Tables['tasks'][];
  accounts: Tables['accounts'][];
  agents: Tables['agents'][];
  approvals: Tables['approvals'][];
  commands: Tables['commands'][];
  messages?: Tables['messages'][];
  deliveries?: Tables['deliveries'][];
};
export function chatActivity(
  state: ActivityState,
  chatId: string,
  now = Date.now(),
) {
  const tasks = state.tasks.filter((t) => t.chatId === chatId);
  const chat = state.chats.find((c) => c.id === chatId);
  const project = state.projects.find((p) => p.id === chat?.projectId);
  const queued = state.commands.some((c) => c.chatId === chatId && c.queued);
  const queuedRequests = state.deliveries?.some(
    (d) =>
      !['acknowledged', 'expired'].includes(d.status) &&
      state.agents.some((a) => a.id === d.recipient && a.chatId === chatId) &&
      state.messages?.some(
        (m) => m.id === d.messageId && isWorkRequest(m.type),
      ),
  );
  const canStop =
    queued ||
    queuedRequests ||
    tasks.some((t) => ['pending', 'running', 'blocked'].includes(t.status));
  const result = (state: string, text: string, busy = false) => ({
    state,
    text,
    busy,
    canStop,
  });
  if (!chat) return result('idle', 'Ready');
  if (project?.status === 'paused' || tasks.some((t) => t.recoveryHold))
    return result('paused', 'This chat is paused. Resume to continue.');
  if (
    state.approvals.some(
      (a) => a.status === 'pending' && tasks.some((t) => t.id === a.taskId),
    )
  )
    return result('approval', 'Waiting for your approval');
  const running = tasks
    .filter((t) => t.status === 'running' || t.turnActive)
    .sort((a, b) => (b.heartbeat || 0) - (a.heartbeat || 0))[0];
  if (running) {
    if (running.heartbeat && now - running.heartbeat > 300000)
      return result(
        'stalled',
        'No runtime update for five minutes. You can stop this work.',
        true,
      );
    const lastMessage = running.responseItems?.at(-1);
    const update =
      lastMessage?.phase === 'commentary' && lastMessage.text
        ? lastMessage.text.slice(-180)
        : running.runtimeStage;
    return result('thinking', update || 'Thinking', true);
  }
  const pending = tasks.find((t) => t.status === 'pending');
  if (pending) {
    const agent = state.agents.find((a) => a.id === pending.agentId);
    const account = state.accounts.find((a) => a.id === agent?.accountId);
    const reason = account
      ? admissionReason(account, now)
      : 'Account unavailable';
    return result(
      'queued',
      reason ? 'Waiting: ' + reason : 'Queued · waiting for an execution slot',
      true,
    );
  }
  if (queued)
    return result(
      'queued',
      'Your next message is queued for a separate reply',
      true,
    );
  if (queuedRequests)
    return result('queued', 'Queued follow-up request to a worker', true);
  const waiting = tasks.find((t) => t.status === 'blocked');
  if (waiting)
    return result(
      'waiting',
      waiting.waitingReason ||
        'Waiting for worker results or your next instruction',
    );
  return result('idle', 'Ready');
}
