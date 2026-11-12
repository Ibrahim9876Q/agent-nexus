import type { State } from './main';
import type { Tables } from '../src/types';
import { commandTasks, workSummary } from '../src/work-summary';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ChatResponse({
  command,
  state,
}: {
  command: Tables['commands'];
  state: State;
}) {
  const tasks = commandTasks(command, state.tasks);
  const primary =
    tasks.find((t) => command.taskIds?.includes(t.id)) || tasks[0];
  const summary = workSummary(tasks, state.agents, state.accounts);
  const reply = command.reply;
  const progress = reply?.progress || [];
  const thinking = reply?.reasoningSummary;
  const paused =
    state.projects.find((p) => p.id === command.projectId)?.status ===
      'paused' || primary?.recoveryHold;
  const active =
    !paused && !!reply && ['queued', 'thinking'].includes(reply.state);
  const answer = reply?.text || (!reply ? primary?.output : '');
  const label =
    paused && reply && ['queued', 'thinking'].includes(reply.state)
      ? 'Paused'
      : reply?.state === 'thinking'
        ? 'Thinking'
        : reply?.state === 'queued'
          ? 'Queued'
          : reply?.state === 'waiting'
            ? 'Waiting'
            : reply?.state || primary?.status || 'Status';
  return (
    <div
      className={'assistant-response' + (active ? ' is-thinking' : '')}
      aria-busy={active}
    >
      <div className="chat-author">
        NEXUS <span>{label}</span>
      </div>
      {thinking && (
        <details className="thinking-panel">
          <summary>Thinking summary</summary>
          <p>{thinking}</p>
        </details>
      )}
      {progress.length > 0 && (
        <details className="thinking-panel">
          <summary>Working updates</summary>
          {progress.map((text, index) => (
            <p key={index}>{text}</p>
          ))}
        </details>
      )}
      {answer ? (
        <div className={'answer-text' + (active ? ' is-streaming' : '')}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img: ({ alt }) => <em>{alt || 'Image'}</em>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {answer}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="response-pending">
          {reply?.error ||
            (paused && reply && ['queued', 'thinking'].includes(reply.state)
              ? 'Paused. Use Resume / continue below.'
              : reply?.state === 'queued'
                ? 'Queued for a separate reply…'
                : reply?.state === 'thinking'
                  ? 'Thinking…'
                  : reply?.state === 'waiting'
                    ? primary?.waitingReason || 'Waiting for worker results.'
                    : command.result)}
        </p>
      )}
      {answer && reply?.error && <p className="failure">{reply.error}</p>}
      {summary.rows.length > 0 && !active && reply?.kind !== 'status' && (
        <div className="response-summary">
          <span>
            {primary?.commandId && primary.commandId !== command.id
              ? 'Job totals · '
              : ''}
            {summary.accountsUsed}{' '}
            {summary.accountsUsed === 1 ? 'account' : 'accounts'} used ·{' '}
            {summary.hasUsage
              ? `${summary.tokens.toLocaleString()}${summary.usageComplete ? '' : '+'} reported tokens${summary.usageComplete ? '' : ' · some usage unavailable'}`
              : 'Token usage not reported'}
          </span>
          <details open={summary.accountsUsed > 1}>
            <summary>Work by account{active ? ' · in progress' : ''}</summary>
            {summary.rows.map(({ task, account, model, effort, tokens }) => (
              <div className="assignment-row" key={task.id}>
                <strong>{account?.name || 'Unknown account'}</strong>
                <span>
                  {model || 'Codex default'}
                  {effort ? ` · ${effort}` : ''}
                </span>
                <p>
                  {task.title} · {task.status}
                  {tokens === undefined
                    ? ' · usage unavailable'
                    : ` · ${tokens.toLocaleString()} tokens`}
                </p>
              </div>
            ))}
          </details>
        </div>
      )}
    </div>
  );
}
