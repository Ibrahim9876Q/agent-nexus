import { useEffect, useState } from 'react';
import type { Account, ApprovalMode } from '../src/types';
import { api } from './api';

export function AccountSettings({
  account,
  onAction,
}: {
  account: Account;
  onAction: (fn: () => Promise<unknown>) => Promise<unknown>;
}) {
  const [model, setModel] = useState(account.model || '');
  const [effort, setEffort] = useState(account.effort || '');
  const [approval, setApproval] = useState<ApprovalMode>(
    account.approvalMode || 'ask',
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setModel(account.model || '');
    setEffort(account.effort || '');
    setApproval(account.approvalMode || 'ask');
  }, [account.model, account.effort, account.approvalMode]);
  const selected = model
    ? account.models?.find((m) => m.model === model)
    : account.models?.find((m) => m.isDefault);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setSaved(false);
    try {
      return await onAction(fn);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-settings">
      <div className="account-setting-fields">
        <label>
          Model
          <select
            aria-label={`Model for ${account.name}`}
            value={model}
            disabled={busy}
            onChange={(e) => {
              setModel(e.target.value);
              setEffort('');
              setSaved(false);
            }}
          >
            <option value="">
              Codex default
              {account.models?.find((m) => m.isDefault)
                ? ` · ${account.models.find((m) => m.isDefault)!.displayName}`
                : ''}
            </option>
            {model && !account.models?.some((m) => m.model === model) && (
              <option value={model}>{model} (refresh models)</option>
            )}
            {account.models?.map((m) => (
              <option value={m.model} key={m.model}>
                {m.displayName}
                {m.hidden ? ' · additional' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reasoning effort
          <select
            aria-label={`Reasoning effort for ${account.name}`}
            value={effort}
            disabled={busy || !selected}
            onChange={(e) => {
              setEffort(e.target.value);
              setSaved(false);
            }}
          >
            <option value="">
              Model default
              {selected?.defaultReasoningEffort
                ? ` · ${selected.defaultReasoningEffort}`
                : ''}
            </option>
            {effort &&
              !selected?.supportedReasoningEfforts.some(
                (e) => e.reasoningEffort === effort,
              ) && <option value={effort}>{effort} (refresh models)</option>}
            {selected?.supportedReasoningEfforts.map((e) => (
              <option key={e.reasoningEffort} value={e.reasoningEffort}>
                {e.reasoningEffort}
              </option>
            ))}
          </select>
        </label>
        <label>
          Approvals
          <select
            aria-label={`Approvals for ${account.name}`}
            value={approval}
            disabled={busy}
            onChange={(e) => {
              setApproval(e.target.value as ApprovalMode);
              setSaved(false);
            }}
          >
            <option value="ask">Ask for approval</option>
            <option value="auto">Approve for me</option>
            <option value="full">Full access</option>
          </select>
        </label>
      </div>
      <p
        className={
          'account-policy ' + (approval === 'full' ? 'full-access' : '')
        }
      >
        {approval === 'full'
          ? 'Full access permits writable workers to use the network and files outside the worktree without execution approval prompts. Read-only children remain read-only.'
          : approval === 'auto'
            ? 'Codex automatically reviews execution approval requests. Requests that still require a person are shown here.'
            : 'Ask before untrusted commands and access outside the worker’s sandbox.'}
      </p>
      {selected && effort && (
        <small>
          {
            selected.supportedReasoningEfforts.find(
              (e) => e.reasoningEffort === effort,
            )?.description
          }
        </small>
      )}
      {account.modelsError && (
        <p className="account-policy">{account.modelsError}</p>
      )}
      <div className="account-setting-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() => api(`/accounts/${account.id}/models`, {}))
          }
        >
          Refresh models
        </button>
        <button
          type="button"
          className="accent"
          disabled={busy}
          onClick={() =>
            void (async () => {
              const result = await run(() =>
                api(`/accounts/${account.id}/settings`, {
                  model: model || null,
                  effort: effort || null,
                  approvalMode: approval,
                }),
              );
              if (result) setSaved(true);
            })()
          }
        >
          Save settings
        </button>
        <small role="status">
          {saved
            ? 'Saved · applies on the next turn'
            : busy
              ? 'Updating…'
              : 'Changes apply on the next turn'}
        </small>
      </div>
    </div>
  );
}
