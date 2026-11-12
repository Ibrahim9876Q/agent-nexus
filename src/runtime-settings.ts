import { z } from 'zod';
import type { Account, Agent, ModelOption } from './types.ts';

export const settingsSchema = z
  .object({
    model: z.string().min(1).max(200).nullable().optional(),
    effort: z.string().min(1).max(100).nullable().optional(),
    approvalMode: z.enum(['ask', 'auto', 'full']).optional(),
  })
  .strict();
export const modelSchema = z.object({
  inputModalities: z.array(z.string()).optional(),
  id: z.string(),
  model: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  hidden: z.boolean().optional(),
  defaultReasoningEffort: z.string().optional(),
  supportedReasoningEfforts: z.array(
    z.object({ reasoningEffort: z.string(), description: z.string() }),
  ),
});
export function selectedModel(
  account: Pick<Account, 'model' | 'models'>,
): ModelOption | undefined {
  return account.model
    ? account.models?.find((m) => m.model === account.model)
    : account.models?.find((m) => m.isDefault);
}
export function runtimeSettings(
  account: Pick<Account, 'model' | 'models' | 'approvalMode'>,
  agent: Pick<Agent, 'permissions'>,
) {
  const mode = account.approvalMode || 'ask';
  const model = account.model || selectedModel(account)?.model;
  return {
    ...(model ? { model } : {}),
    approvalPolicy:
      mode === 'full' ? 'never' : mode === 'auto' ? 'on-request' : 'untrusted',
    approvalsReviewer: mode === 'auto' ? 'auto_review' : 'user',
    // Read-only delegation remains read-only even on a full-access account.
    sandbox:
      mode === 'full' && agent.permissions === 'workspace-write'
        ? 'danger-full-access'
        : agent.permissions,
  };
}
