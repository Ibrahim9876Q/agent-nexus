import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Task } from '../src/types';
import { api } from './api';
import { ExternalLink } from './ExternalLink';
import { highlightLines, highlightPatch } from './output-syntax';

type Changes = {
  files: { path: string; status: 'tracked' | 'untracked' }[];
  patch: string | null;
  truncated?: boolean;
  patchError?: string;
};

export default function OutputView({ tasks }: { tasks: Task[] }) {
  const [selected, setSelected] = useState('');
  const task = tasks.find((item) => item.id === selected) || tasks.at(-1);
  if (!task)
    return (
      <section className="output-view">
        <p>Open a chat with agent work to see its output.</p>
      </section>
    );
  return (
    <section className="output-view" aria-label="Agent output">
      <header className="output-header">
        <h2>Output</h2>
        <select
          aria-label="Task output"
          value={task.id}
          onChange={(event) => setSelected(event.target.value)}
        >
          {tasks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <small>{task.status}</small>
      </header>
      <TaskOutput key={task.id} task={task} />
    </section>
  );
}

function Tokens({
  tokens,
}: {
  tokens: ReturnType<typeof highlightLines>[number];
}) {
  return tokens.map((token, index) => (
    <span key={index} className={token.className}>
      {token.text}
    </span>
  ));
}

function Syntax({ source, language }: { source: string; language: string }) {
  const lines = useMemo(
    () => highlightLines(source, language),
    [source, language],
  );
  return lines.map((tokens, index) => (
    <span key={index}>
      <Tokens tokens={tokens} />
      {index + 1 < lines.length && '\n'}
    </span>
  ));
}

function CodeDiff({
  patch,
  file,
  truncated,
}: {
  patch?: string | null;
  file: string;
  truncated?: boolean;
}) {
  const rows = useMemo(
    () => (patch ? highlightPatch(patch, file) : []),
    [patch, file],
  );
  return (
    <pre className="output-syntax">
      {rows.length
        ? rows.map((row, index) => (
            <span className={'diff-row diff-' + row.kind} key={index}>
              {row.tokens ? (
                <>
                  <span className="diff-marker">{row.text[0]}</span>
                  <Tokens tokens={row.tokens} />
                </>
              ) : (
                row.text
              )}
              {index + 1 < rows.length && '\n'}
            </span>
          ))
        : 'No diff available.'}
      {truncated && '\n[Preview truncated]'}
    </pre>
  );
}

function TaskOutput({ task }: { task: Task }) {
  const [view, setView] = useState<'changes' | 'activity'>('changes');
  const [file, setFile] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [changes, setChanges] = useState<Changes>();
  const [patchFile, setPatchFile] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (view !== 'changes' || !task.worktree) return;
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      const query = file ? '?' + new URLSearchParams({ file }) : '';
      try {
        const result: Changes = await api(
          '/tasks/' + task.id + '/changes' + query,
        );
        if (closed) return;
        setChanges(result);
        setPatchFile(file);
        setError('');
        if (!result.files.some((entry) => entry.path === file))
          setFile(result.files[0]?.path || '');
      } catch (error) {
        if (!closed)
          setError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!closed) timer = setTimeout(load, 4000);
      }
    }
    void load();
    return () => {
      closed = true;
      clearTimeout(timer);
    };
  }, [task.id, task.worktree, view, file, refresh]);

  return (
    <>
      <div className="output-actions" aria-label="Output type">
        <button
          aria-pressed={view === 'changes'}
          onClick={() => setView('changes')}
        >
          Changes
        </button>
        <button
          aria-pressed={view === 'activity'}
          onClick={() => setView('activity')}
        >
          Activity
        </button>
        {view === 'changes' && (
          <button
            className="output-refresh"
            disabled={!task.worktree}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Refresh
          </button>
        )}
      </div>
      {view === 'activity' ? (
        <div className="output-activity output-syntax">
          {task.activity?.length ? (
            <ol>
              {task.activity.map((item) => (
                <li key={item.id}>
                  <time dateTime={new Date(item.at).toISOString()}>
                    {new Date(item.at).toLocaleTimeString()}
                  </time>
                  <code>
                    {item.kind === 'command' ? '$ ' : ''}
                    {item.kind === 'command' ? (
                      <Syntax
                        source={item.label}
                        language={
                          /\$(?:env|script|global):|\b(?:get|set|new|remove|select)-(?:item|content|path|object|process)\b/i.test(
                            item.label,
                          )
                            ? 'powershell'
                            : 'bash'
                        }
                      />
                    ) : (
                      item.label
                    )}
                  </code>
                  <small>
                    {item.exitCode != null
                      ? `exit ${item.exitCode}`
                      : item.status}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p>No command, edit, or tool activity reported yet.</p>
          )}
          {task.output && (
            <div className="output-response" aria-label="Agent response">
              <ReactMarkdown
                skipHtml
                components={{
                  img: ({ alt }) => <em>{alt || 'Image'}</em>,
                  a: ({ href, children }) => (
                    <ExternalLink href={href}>{children}</ExternalLink>
                  ),
                  code: ({ className, children }) => (
                    <code className={className}>
                      {typeof children === 'string' &&
                      (className || children.endsWith('\n')) ? (
                        <Syntax
                          source={children}
                          language={
                            className?.match(/language-(\S+)/)?.[1] || ''
                          }
                        />
                      ) : (
                        children
                      )}
                    </code>
                  ),
                }}
              >
                {task.output}
              </ReactMarkdown>
            </div>
          )}
          {task.error && <pre role="alert">{task.error}</pre>}
        </div>
      ) : (
        <div className="output-changes">
          {error && <p role="alert">{error}</p>}
          {!task.worktree ? (
            <p>The task hasn’t created a worktree yet.</p>
          ) : !changes ? (
            !error && <p>Checking files…</p>
          ) : !changes.files.length ? (
            <p>No changed files in this worktree.</p>
          ) : (
            <>
              <div className="output-files" aria-label="Changed files">
                {changes.files.map((entry) => (
                  <button
                    key={entry.path}
                    title={entry.path}
                    aria-pressed={entry.path === file}
                    onClick={() => setFile(entry.path)}
                  >
                    <span>{entry.path}</span>
                    <small>
                      {entry.status === 'untracked' ? 'New' : 'Changed'}
                    </small>
                  </button>
                ))}
              </div>
              <div
                className="output-patch"
                role="region"
                aria-label="File diff"
                tabIndex={0}
              >
                {patchFile !== file ? (
                  <p>Loading diff…</p>
                ) : changes.patchError ? (
                  <p role="alert">{changes.patchError}</p>
                ) : (
                  <CodeDiff
                    patch={changes.patch}
                    file={file}
                    truncated={changes.truncated}
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
