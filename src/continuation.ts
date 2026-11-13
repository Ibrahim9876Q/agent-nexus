import type { Agent, Message, Task } from './types.ts';

export function isWorkRequest(type: string) {
  return /(?:^|[_-])(request|assignment|followup|directive)$|^WORK_REQUEST$|^ACTION_REQUIRED$/i.test(
    type,
  );
}
export function relatedWorker(
  sender: Agent,
  recipient: Agent,
  task: Task,
  tasks: Task[],
) {
  return (
    sender.chatId === recipient.chatId &&
    sender.projectId === recipient.projectId &&
    (sender.role === 'coordinator' ||
      recipient.parentId === sender.id ||
      tasks.some(
        (t) => t.id === task.parentTaskId && t.agentId === sender.id,
      ) ||
      (!!task.parentTaskId &&
        tasks.some(
          (t) => t.id === sender.taskId && t.parentTaskId === task.parentTaskId,
        )))
  );
}
export function requestedResult(
  message: Message,
  recipient: Agent,
  task: Task,
  messages: Message[],
  tasks: Task[],
) {
  if (recipient.role !== 'coordinator') return false;
  const child = tasks.find((t) => t.id === message.taskId);
  return (
    child?.parentTaskId === task.id &&
    messages.some(
      (m) =>
        m.sender === recipient.id &&
        m.recipient === message.sender &&
        isWorkRequest(m.type) &&
        m.timestamp <= message.timestamp,
    )
  );
}
