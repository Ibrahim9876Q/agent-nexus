import type { State } from './main';
import type { Tables, Task } from '../src/types';

export function accountLabel(state: State, accountId?: string) {
  const account = state.accounts.find((item) => item.id === accountId);
  return account?.email || account?.name || 'Unknown account';
}

export function TeamActivity({
  command,
  state,
  workers,
  lead,
}: {
  command: Tables['commands'];
  state: State;
  workers: Task[];
  lead: string;
}) {
  const plan = command.teamPlan;
  const agentAccount = (key: string) =>
    state.agents.find((agent) => agent.id === key)?.accountId;
  const workerIds = new Set(workers.map((worker) => worker.id));
  const messages = (state.messages || []).filter(
    (message) =>
      message.projectId === command.projectId &&
      (message.commandId
        ? message.commandId === command.id
        : !!message.taskId &&
          (workerIds.has(message.taskId) ||
            (workers.length > 0 &&
              command.taskIds?.includes(message.taskId))) &&
          message.timestamp >= command.at),
  );
  if (!plan && !workers.length && !messages.length) return null;
  return (
    <section className="team-activity" aria-label="Team activity">
      <h3>Team activity</h3>
      {plan && (
        <div className="team-plan">
          <p>{plan.rationale}</p>
          <p>
            <strong>{lead}</strong>{' '}
            <span className="team-role">Coordinator</span>
          </p>
          <p>{plan.leadTask} · Reviews the team’s work</p>
        </div>
      )}
      {workers.map((worker) => {
        const progress =
          worker.responseItems?.filter(
            (item) => item.phase === 'commentary' && item.text,
          ) || [];
        return (
          <article className="team-worker" key={worker.id}>
            <div className="chat-author">
              <strong>
                {accountLabel(state, agentAccount(worker.agentId))}
              </strong>{' '}
              <span>
                {worker.turnActive
                  ? 'Working'
                  : worker.recoveryHold
                    ? 'Paused'
                    : worker.status === 'pending'
                      ? 'Queued'
                      : worker.status}
              </span>
            </div>
            <div>{worker.title}</div>
            {(worker.waitingReason || worker.runtimeStage || worker.error) && (
              <p className="team-meta">
                {worker.waitingReason || worker.runtimeStage || worker.error}
              </p>
            )}
            {worker.reasoningSummary && (
              <details>
                <summary>Thinking summary</summary>
                <p>{worker.reasoningSummary}</p>
              </details>
            )}
            {!!progress.length && (
              <details open={worker.status === 'running'}>
                <summary>Working updates</summary>
                {progress.map((item) => (
                  <p key={item.id}>{item.text}</p>
                ))}
              </details>
            )}
            {worker.output && (
              <details open={worker.status === 'completed'}>
                <summary>Worker reply</summary>
                <p>{worker.output}</p>
              </details>
            )}
          </article>
        );
      })}
      {!!messages.length && (
        <details className="team-messages" open>
          <summary>Account messages ({messages.length})</summary>
          <ol>
            {messages.map((message) => {
              const from = accountLabel(
                state,
                message.senderAccountId || agentAccount(message.sender),
              );
              const to = accountLabel(
                state,
                message.recipientAccountId || agentAccount(message.recipient),
              );
              const delivery = state.deliveries?.find(
                (row) => row.messageId === message.id,
              );
              const payload = message.payload;
              const report =
                payload && typeof payload === 'object' && 'summary' in payload
                  ? (payload as { summary: unknown; reason?: unknown })
                  : undefined;
              return (
                <li key={message.id}>
                  <div>
                    <strong>{from}</strong> → <strong>{to}</strong>
                  </div>
                  <small className="team-meta">
                    {message.type.replaceAll('_', ' ')}
                    {delivery ? ` · ${delivery.status}` : ''}
                  </small>
                  <p>
                    {typeof payload === 'string'
                      ? payload
                      : report
                        ? [report.summary, report.reason]
                            .filter(Boolean)
                            .join('\n')
                        : JSON.stringify(payload)}
                  </p>
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
}
