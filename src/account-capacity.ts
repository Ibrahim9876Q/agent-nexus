import { z } from 'zod';
import type { Account } from './types.ts';
const windowSchema = z.object({
  usedPercent: z.number().min(0),
  windowDurationMins: z.number().nullable().optional(),
  resetsAt: z.number().nullable().optional(),
});
const snapshotSchema = z.object({
  primary: windowSchema.nullable().optional(),
  secondary: windowSchema.nullable().optional(),
});
export function capacityUpdate(
  account: Account,
  input: unknown,
  now = Date.now(),
  sparse = true,
): Account {
  const parsed = snapshotSchema.parse(input);
  const previous = account.capacity;
  return {
    ...account,
    capacity: {
      primary: parsed.primary ?? (sparse ? previous?.primary : undefined),
      secondary: parsed.secondary ?? (sparse ? previous?.secondary : undefined),
      observedAt: now,
    },
    capacityError: undefined,
  };
}
export function admissionReason(
  account: Account,
  now = Date.now(),
): string | undefined {
  if (account.enabled === false) return 'draining';
  if (account.status !== 'ready') return account.status;
  if (account.cooldownUntil && account.cooldownUntil > now) return 'cooldown';
  for (const w of [account.capacity?.primary, account.capacity?.secondary])
    if (w && w.usedPercent >= 100 && (!w.resetsAt || w.resetsAt * 1000 > now))
      return 'quota reached';
}
export function backoffUntil(code: unknown, now = Date.now()) {
  return code === 'rateLimitExceeded'
    ? now + 60000
    : code === 'serverOverloaded'
      ? now + 15000
      : undefined;
}
