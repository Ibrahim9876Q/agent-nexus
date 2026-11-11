import { z } from 'zod';
import type { Task } from './types.ts';

const count = z.number().int().nonnegative();
const usageSchema = z.object({
  totalTokens: count,
  inputTokens: count,
  cachedInputTokens: count,
  outputTokens: count,
  reasoningOutputTokens: count,
});
export function reportedUsage(value: unknown) {
  return usageSchema.safeParse(value);
}
export function answerText(task: Task) {
  if (!task.responseItems) return task.output || '';
  const answers = task.responseItems.filter(
    (i) => i.phase === 'final_answer' || i.phase === 'partial_answer',
  );
  const items = answers.length
    ? answers
    : task.responseItems.filter((i) => !i.phase).slice(-1);
  return items
    .map((i) => i.text)
    .filter(Boolean)
    .join('\n\n')
    .slice(-50000);
}
export function responseUpdate(task: Task, method: string, params: any): Task {
  const lifecycle = method === 'item/started' || method === 'item/completed';
  const item = lifecycle ? params.item : undefined;
  if (item?.type === 'agentMessage' || method === 'item/agentMessage/delta') {
    const id = String(item?.id || params.itemId || 'legacy-message');
    const items = [...(task.responseItems || [])];
    const index = items.findIndex((i) => i.id === id);
    const prior = index >= 0 ? items[index] : { id, text: '' };
    const next = {
      ...prior,
      text: (typeof item?.text === 'string'
        ? item.text
        : prior.text + (params.delta || '')
      ).slice(-50000),
      ...(item?.phase ? { phase: item.phase } : {}),
    };
    if (index >= 0) items[index] = next;
    else items.push(next);
    const updated = { ...task, responseItems: items.slice(-100) };
    return { ...updated, output: answerText(updated) };
  }
  // Only the provider's public summary stream is retained, never raw reasoning.
  if (
    (item?.type === 'reasoning' && Array.isArray(item.summary)) ||
    method === 'item/reasoning/summaryTextDelta' ||
    method === 'item/reasoning/summaryPartAdded'
  ) {
    const id = String(item?.id || params.itemId || 'summary');
    const summaries = [...(task.reasoningSummaries || [])];
    const index = summaries.findIndex((s) => s.id === id);
    const parts = [...(index >= 0 ? summaries[index].parts : [])];
    if (item) {
      parts.splice(
        0,
        parts.length,
        ...item.summary
          .filter((s: unknown) => typeof s === 'string')
          .slice(0, 100)
          .map((s: string) => s.slice(-30000)),
      );
    } else if (
      method === 'item/reasoning/summaryTextDelta' &&
      typeof params.delta === 'string'
    ) {
      const part = Number.isInteger(params.summaryIndex)
        ? params.summaryIndex
        : 0;
      if (part < 0 || part > 99) return task;
      parts[part] = ((parts[part] || '') + params.delta).slice(-30000);
    }
    const next = { id, parts };
    if (index >= 0) summaries[index] = next;
    else summaries.push(next);
    return {
      ...task,
      reasoningSummaries: summaries.slice(-50),
      reasoningSummary: summaries
        .flatMap((s) => s.parts)
        .filter(Boolean)
        .join('\n\n')
        .slice(-30000),
    };
  }
  if (
    method === 'thread/tokenUsage/updated' &&
    typeof params.turnId === 'string'
  ) {
    // Subtract the captured thread total at turn start. `last` only describes
    // one model request, and a tool-using turn may contain many requests.
    const usage = usageSchema.safeParse(params.tokenUsage?.total);
    const baseline = task.usageBaselines?.[params.turnId];
    if (usage.success && baseline) {
      const delta = Object.fromEntries(
        Object.entries(usage.data).map(([key, value]) => [
          key,
          value - baseline[key as keyof typeof baseline],
        ]),
      );
      const parsed = usageSchema.safeParse(delta);
      if (parsed.success)
        return {
          ...task,
          usageByTurn: { ...task.usageByTurn, [params.turnId]: parsed.data },
        };
    }
  }
  return task;
}
