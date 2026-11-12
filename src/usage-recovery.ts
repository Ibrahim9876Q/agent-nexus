import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store, id } from './db/store.ts';
import type { Account, ApprovalMode, Task } from './types.ts';
import { admissionReason } from './account-capacity.ts';
const exec = promisify(execFile);

// A reset timestamp is not proof that quota has returned: wait for a fresh
// provider snapshot below the threshold before admitting another turn.
export function usagePressure(account: Account, threshold = 95) {
  return [account.capacity?.primary, account.capacity?.secondary].some(
    (window) => window && window.usedPercent >= threshold,
  );
}
export function recoveryCandidate(source: Account, candidates: Account[]) {
  return candidates
    .filter(
      (a) =>
        a.id !== source.id &&
        a.provider === source.provider &&
        !admissionReason(a) &&
        !usagePressure(a),
    )
    .sort((a, b) => {
      const pressure = (x: Account) =>
        Math.max(
          x.capacity?.primary?.usedPercent ?? 50,
          x.capacity?.secondary?.usedPercent ?? 50,
        );
      return pressure(a) - pressure(b);
    })[0];
}
export function stricterApproval(
  a: ApprovalMode = 'ask',
  b: ApprovalMode = 'ask',
): ApprovalMode {
  const order: ApprovalMode[] = ['ask', 'auto', 'full'];
  return order[Math.min(order.indexOf(a), order.indexOf(b))];
}

export async function saveUsageCheckpoint(
  store: Store,
  dataDir: string,
  task: Task,
) {
  const folder = join(dataDir, 'handoffs', id());
  await mkdir(folder, { recursive: true });
  let gitCommit: string | undefined;
  if (task.worktree) {
    // Snapshot into a private ref with a separate index. Do not change the
    // worker's index, branch, staged files, ignored files, or remote.
    const index = join(folder, 'index');
    const run = async (...args: string[]) =>
      (
        await exec('git', ['-C', task.worktree!, ...args], {
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024,
          env: { ...process.env, GIT_INDEX_FILE: index },
        })
      ).stdout.trim();
    try {
      const parent = await run('rev-parse', 'HEAD');
      await run('read-tree', 'HEAD');
      await run('add', '--all');
      const tree = await run('write-tree');
      gitCommit = await run(
        '-c',
        'user.name=Agent Nexus',
        '-c',
        'user.email=agent-nexus@localhost',
        'commit-tree',
        tree,
        '-p',
        parent,
        '-m',
        `Nexus usage checkpoint ${task.id}`,
      );
      await run(
        'update-ref',
        `refs/nexus/checkpoints/${folder.split(/[\\/]/).at(-1)}`,
        gitCommit,
      );
    } finally {
      await unlink(index).catch(() => {});
    }
  }
  const agent = store.get('agents', task.agentId);
  const commands = store
    .all('commands')
    .filter((c) => c.chatId === task.chatId)
    .map((c) => ({
      text: c.text,
      at: c.at,
      attachmentIds: c.attachmentIds,
      reply: c.reply && { text: c.reply.text, state: c.reply.state },
    }));
  const tasks = store
    .all('tasks')
    .filter((t) => t.chatId === task.chatId)
    .map((t) => ({
      id: t.id,
      agentId: t.agentId,
      title: t.title,
      prompt: t.prompt,
      nextInput: t.nextInput,
      status: t.status,
      output: t.output,
      responseItems: t.responseItems,
      activity: t.activity,
      execution: t.execution,
      waitingReason: t.waitingReason,
      dependencies: t.dependencies,
      parentTaskId: t.parentTaskId,
      worktree: t.worktree,
      branch: t.branch,
    }));
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    taskId: task.id,
    project: store.get('projects', task.projectId),
    role: agent.role,
    worktree: task.worktree,
    branch: task.branch,
    gitCommit,
    permissions: agent.permissions,
    approvalCeiling: task.approvalCeiling,
    currentRequest: task.nextInput || task.prompt,
    commands,
    tasks,
    workers: store
      .all('agents')
      .filter((worker) => worker.chatId === task.chatId)
      .map((worker) => ({
        id: worker.id,
        accountId: worker.accountId,
        role: worker.role,
        parentId: worker.parentId,
        taskId: worker.taskId,
        status: worker.status,
        permissions: worker.permissions,
      })),
    messages: store
      .all('messages')
      .filter(
        (m) =>
          m.projectId === task.projectId &&
          store.get('agents', m.recipient).chatId === task.chatId,
      ),
    attachments: store
      .all('attachments')
      .filter((a) => a.chatId === task.chatId),
  };
  const path = join(folder, 'context.json');
  await writeFile(path, JSON.stringify(manifest, null, 2), { flag: 'wx' });
  return path;
}
