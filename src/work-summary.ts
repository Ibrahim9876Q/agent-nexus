import type { Account, Agent, Tables, Task } from './types.ts';

export function commandTasks(command: Tables['commands'], tasks: Task[]) {
  const ids = new Set(command.taskIds || []);
  let selected = tasks.filter(
    (t) =>
      t.commandId === command.id ||
      ids.has(t.id) ||
      (!command.taskIds && !t.commandId && command.targets.includes(t.agentId)),
  );
  // Include descendants when a directive steers an already-running job.
  for (;;) {
    const included = new Set(selected.map((t) => t.id));
    const next = tasks.filter(
      (t) =>
        included.has(t.id) || (t.parentTaskId && included.has(t.parentTaskId)),
    );
    if (next.length === selected.length) return selected;
    selected = next;
  }
}
export function workSummary(
  tasks: Task[],
  agents: Agent[],
  accounts: Account[],
) {
  const used = tasks.filter((t) => t.attempts > 0);
  const rows = used.map((task) => {
    const agent = agents.find((a) => a.id === task.agentId);
    const account = accounts.find((a) => a.id === agent?.accountId);
    const usage = Object.values(task.usageByTurn || {});
    return {
      task,
      account,
      model: task.execution?.model,
      effort: task.execution?.effort,
      usageComplete:
        !!task.turnIds?.length &&
        task.turnIds.every((id) => task.usageByTurn?.[id]),
      tokens: usage.length
        ? usage.reduce((n, u) => n + u.totalTokens, 0)
        : undefined,
    };
  });
  const known = rows.filter((r) => r.tokens !== undefined);
  return {
    rows,
    accountsUsed: new Set(rows.map((r) => r.account?.id).filter(Boolean)).size,
    tokens: known.reduce((n, r) => n + r.tokens!, 0),
    usageComplete: rows.length > 0 && rows.every((r) => r.usageComplete),
    hasUsage: known.length > 0,
  };
}
