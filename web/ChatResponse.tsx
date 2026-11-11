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
  const progress = tasks.flatMap((t) =>
    (t.responseItems || [])
      .filter((i) => i.phase === 'commentary')
      .map((i) => ({ task: t, ...i })),
  );
  const thinking = tasks.filter((t) => t.reasoningSummary?.trim());
  const active = tasks.some((t) =>
    ['pending', 'running', 'blocked'].includes(t.status),
  );
  const answer = primary?.output;
  if (!primary) return <p className="dispatch-status">{command.result}</p>;
  return (
    <div className="assistant-response">
      <div className="chat-author">
        NEXUS <span>{active ? 'Working' : primary.status}</span>
      </div>
      {thinking.length > 0 && (
        <details className="thinking-panel">
          <summary>Thinking summary</summary>
          {thinking.map((t) => (
            <div key={t.id}>
              <small>{t.title}</small>
              <p>{t.reasoningSummary}</p>
            </div>
          ))}
        </details>
      )}
      {progress.length > 0 && (
        <details className="thinking-panel">
          <summary>Working updates</summary>
          {progress.map((item) => (
            <p key={item.id}>{item.text}</p>
          ))}
        </details>
      )}
      {answer ? (
        <div className="answer-text">
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
          {primary.error ||
            (active
              ? 'Working on your message…'
              : 'No answer text was reported. Open Agents for task details.')}
        </p>
      )}
      {answer && primary.error && <p className="failure">{primary.error}</p>}
      {summary.rows.length > 0 && (
        <div className="response-summary">
          <span>
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
