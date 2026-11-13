import type { ChatReply, Task } from './types.ts';
import type { Store } from './db/store.ts';

export function taskReply(task: Task): ChatReply {
  return {
    text: task.output || '',
    state:
      task.status === 'running'
        ? 'thinking'
        : task.status === 'pending'
          ? 'queued'
          : task.status === 'blocked'
            ? 'waiting'
            : task.status,
    reasoningSummary: task.reasoningSummary,
    progress: task.responseItems
      ?.filter((i) => i.phase === 'commentary')
      .map((i) => i.text)
      .filter(Boolean),
    error: task.error,
    updatedAt: new Date().toISOString(),
    kind: 'assistant',
  };
}
export function migrateReplies(store: Store) {
  const commands = store.all('commands');
  const tasks = store.all('tasks');
  for (const command of commands.filter((c) => !c.reply)) {
    if (['pause', 'resume'].includes(command.mode)) {
      store.put('commands', {
        ...command,
        reply: {
          text: command.result,
          state: 'completed',
          kind: 'status',
          updatedAt: command.at,
        },
      });
      continue;
    }
    const task =
      tasks.find((t) => command.taskIds?.includes(t.id)) ||
      tasks.find((t) => command.targets.includes(t.agentId));
    const last = task
      ? commands
          .filter(
            (c) =>
              c.taskIds?.includes(task.id) ||
              (!c.taskIds && c.targets.includes(task.agentId)),
          )
          .at(-1)
      : undefined;
    if (task && last?.id === command.id) {
      store.put('commands', { ...command, reply: taskReply(task) });
      store.put('tasks', { ...task, replyCommandId: command.id });
    } else
      store.put('commands', {
        ...command,
        reply: {
          text: ['pause', 'resume'].includes(command.mode)
            ? command.result
            : 'This earlier message has no separate saved reply. New replies are saved with each message.',
          state: 'completed',
          kind: 'status',
          legacyMissing: !['pause', 'resume'].includes(command.mode),
          updatedAt: command.at,
        },
      });
  }
}

// Recover only public assistant messages that can be associated with a recorded
// user input. Never import raw reasoning or manufacture missing conversation.
export function publicHistoryReplies(
  turns: any[],
  commands: import('./types.ts').Tables['commands'][],
) {
  const found = new Map<string, string>();
  const ordered = [...commands].sort((a, b) => a.at.localeCompare(b.at));
  for (const turn of [...turns].sort(
    (a, b) => (a.startedAt || 0) - (b.startedAt || 0),
  )) {
    let current: (typeof ordered)[number] | undefined;
    for (const item of turn.items || []) {
      if (item.type === 'userMessage') {
        const explicit = ordered.find((c) => c.id === item.clientId);
        if (explicit) {
          current = explicit;
          continue;
        }
        const text = (item.content || [])
          .filter((c: any) => c.type === 'text' && typeof c.text === 'string')
          .map((c: any) => c.text)
          .join('\n')
          .split(
            /\n\n(?:Coordination mode|Project objective|Workspace context|Prerequisite artifacts|Untrusted queued messages)/,
          )[0];
        if (text.startsWith('Untrusted coordination message')) continue;
        const before =
          item.startedAtMs ||
          (turn.completedAt || turn.startedAt
            ? (turn.completedAt || turn.startedAt) * 1000
            : undefined);
        const matches = ordered.filter(
          (c) =>
            (!before || Date.parse(c.at) <= before + 1000) &&
            (text === c.text ||
              text.startsWith(c.text + '\n') ||
              (c.text.length > 20 && text.includes(c.text)) ||
              text
                .split('\n')
                .some(
                  (line: string) =>
                    line.endsWith('Objective: ' + c.text) ||
                    line.endsWith('User: ' + c.text) ||
                    line.endsWith('User master directive: ' + c.text),
                )),
        );
        current = matches.at(-1);
      }
      if (
        current &&
        item.type === 'agentMessage' &&
        typeof item.text === 'string' &&
        ['final_answer', 'partial_answer', undefined, null].includes(
          item.phase,
        ) &&
        item.text.trim()
      )
        found.set(current.id, item.text.slice(-50000));
    }
  }
  return found;
}
