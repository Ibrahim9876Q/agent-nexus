import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Engine } from './engine.ts';
import { git } from './integrations/git.ts';
import { id } from './db/store.ts';
import type { Agent, Task, Message } from './types.ts';
const exec = promisify(execFile);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const marker = 'Nexus acceptance simulation:';

async function waitMessage(
  engine: Engine,
  agent: Agent,
  type: string,
): Promise<Message> {
  for (let i = 0; i < 150; i++) {
    const m = engine.bus.inbox(agent.id).find((m) => m.type === type);
    if (m) {
      engine.bus.ack(agent.id, m.id);
      return m;
    }
    await delay(50);
  }
  throw new Error(`Simulation timed out waiting for ${type}`);
}
async function commit(path: string, message: string) {
  await git(path, 'add', '--all');
  await git(
    path,
    '-c',
    'user.name=Nexus Simulation',
    '-c',
    'user.email=nexus@example.invalid',
    'commit',
    '-m',
    message,
  );
  return git(path, 'rev-parse', 'HEAD');
}
export async function executeMock(
  task: Task,
  agent: Agent,
  engine: Engine,
): Promise<string> {
  const project = engine.store.get('projects', task.projectId);
  if (!project.objective.startsWith(marker))
    return 'Simulation only: this task ran without a model. No implementation was generated. Use a connected Codex account for real development.';
  const peers = () =>
    engine.store.all('agents').filter((a) => a.projectId === agent.projectId);
  if (agent.role === 'backend') {
    const request = await waitMessage(engine, agent, 'NEED_DEPENDENCY');
    engine.bus.send(
      agent.id,
      request.sender,
      'DECISION_RESOLVED',
      {
        endpoint: 'GET /api/greeting',
        response: { message: 'Hello from Nexus' },
      },
      'api-contract',
      request.correlationId,
    );
    const child = engine.delegate(
      agent.id,
      'contract-review',
      'Review the API contract',
      'Verify the greeting contract.',
    );
    await writeFile(
      join(task.worktree!, 'backend.mjs'),
      "export function greeting() { return { message: 'Hello from Nexus' }; }\n",
    );
    const sha = await commit(task.worktree!, 'Implement greeting API');
    engine.bus.send(
      agent.id,
      request.sender,
      'DEPENDENCY_READY',
      { sha, worktree: task.worktree },
      'backend-ready',
      request.correlationId,
    );
    await waitMessage(engine, agent, 'TASK_COMPLETED');
    return JSON.stringify({
      sha,
      childId: child.agent.id,
      tests: 'Contract reviewed by delegated worker',
      changed: ['backend.mjs'],
    });
  }
  if (agent.role === 'frontend') {
    const backend = peers().find((a) => a.role === 'backend')!;
    engine.bus.send(
      agent.id,
      backend.id,
      'NEED_DEPENDENCY',
      { need: 'Greeting response contract' },
      'need-api',
    );
    const contract = await waitMessage(engine, agent, 'DECISION_RESOLVED');
    await writeFile(
      join(task.worktree!, 'frontend.mjs'),
      'export function renderGreeting(response) { return `<h1>${response.message}</h1>`; }\n',
    );
    engine.store.event('simulation.independent-work', {
      projectId: project.id,
      agentId: agent.id,
      contractMessageId: contract.id,
    });
    await waitMessage(engine, agent, 'DEPENDENCY_READY');
    const sha = await commit(task.worktree!, 'Implement greeting UI');
    return JSON.stringify({
      sha,
      tests: 'Integration test runs in review task',
      changed: ['frontend.mjs'],
    });
  }
  if (agent.role === 'contract-review') {
    return 'Reviewed GET /api/greeting contract: message is a string; frontend and backend agree.';
  }
  if (agent.role === 'reviewer') {
    const tasks = engine.store
      .all('tasks')
      .filter((t) => t.projectId === task.projectId);
    const implementations = ['backend', 'frontend'].map((role) =>
      tasks.find((t) => engine.store.get('agents', t.agentId).role === role)!,
    );
    for (const implementation of implementations) {
      const sha = JSON.parse(implementation.output!).sha;
      await git(
        task.worktree!,
        '-c',
        'user.name=Nexus Simulation',
        '-c',
        'user.email=nexus@example.invalid',
        'cherry-pick',
        sha,
      );
    }
    await writeFile(
      join(task.worktree!, 'integration.test.mjs'),
      "import {test} from 'node:test';\nimport assert from 'node:assert/strict';\nimport {greeting} from './backend.mjs';\nimport {renderGreeting} from './frontend.mjs';\ntest('frontend consumes backend contract', () => assert.equal(renderGreeting(greeting()), '<h1>Hello from Nexus</h1>'));\n",
    );
    const result = await exec(
      process.execPath,
      ['--test', 'integration.test.mjs'],
      { cwd: task.worktree, windowsHide: true },
    );
    await commit(task.worktree!, 'Verify combined frontend and backend');
    const coordinator = peers().find((a) => a.role === 'coordinator')!;
    engine.bus.send(
      agent.id,
      coordinator.id,
      'REVIEW_RESULT',
      { passed: true, branch: task.branch, tests: result.stdout },
      'review-passed',
    );
    return JSON.stringify({
      tests: '1 integration test passed',
      integrationBranch: task.branch,
      outstandingIssues: [],
      defaultBranchChanged: false,
    });
  }
  if (agent.role === 'coordinator') {
    const review = await waitMessage(engine, agent, 'REVIEW_RESULT');
    const summary = {
      project: project.name,
      review: review.payload,
      messages: engine.store
        .all('messages')
        .filter((m) => m.projectId === project.id).length,
      outstandingIssues: [],
      mode: 'mock',
    };
    await writeFile(
      join(task.worktree!, 'nexus-summary.json'),
      JSON.stringify(summary, null, 2),
    );
    return JSON.stringify(summary);
  }
  return 'Simulation completed';
}

export async function seedSimulation(engine: Engine) {
  const repoPath = join(engine.dataDir, 'simulations', id());
  await mkdir(repoPath, { recursive: true });
  await git(repoPath, 'init', '-b', 'main');
  await writeFile(
    join(repoPath, 'README.md'),
    '# Nexus simulation fixture\nGenerated and owned by the acceptance simulation.\n',
  );
  await commit(repoPath, 'Initialize simulation repository');
  const repo = await engine.addRepo(repoPath, 'Greeting application');
  const project = engine.addProject(
    repo.id,
    'Three-account collaboration',
    `${marker} backend, frontend, delegated review, and isolated integration.`,
  );
  const accounts = [
    'A · Coordination',
    'B · Implementation',
    'C · Frontend',
  ].map((name) =>
    engine.addAccount({ name, provider: 'mock', concurrency: 2 }),
  );
  const coordinator = engine.addAgent(
    accounts[0].id,
    project.id,
    'coordinator',
  );
  const backend = engine.addAgent(accounts[1].id, project.id, 'backend');
  const frontend = engine.addAgent(accounts[2].id, project.id, 'frontend');
  const reviewer = engine.addAgent(accounts[0].id, project.id, 'reviewer');
  const b = engine.addTask(
    backend.id,
    'Implement greeting API',
    'Backend fixture',
    [],
    ['backend.mjs'],
  );
  const f = engine.addTask(
    frontend.id,
    'Build greeting interface',
    'Frontend fixture; negotiate the contract while working independently',
    [],
    ['frontend.mjs'],
  );
  const r = engine.addTask(
    reviewer.id,
    'Review and integrate both branches',
    'Review fixture',
    [b.id, f.id],
  );
  engine.addTask(
    coordinator.id,
    'Summarize completed project',
    'Record completion',
    [r.id],
  );
  return { project, accounts, repo };
}

export async function waitForSimulation(
  engine: Engine,
  projectId: string,
  timeout = 30000,
) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    await engine.tick();
    const tasks = engine.store
      .all('tasks')
      .filter((t) => t.projectId === projectId);
    const failed = tasks.find((t) =>
      ['failed', 'interrupted'].includes(t.status),
    );
    if (failed) throw new Error(`${failed.title}: ${failed.error}`);
    if (tasks.length && tasks.every((t) => t.status === 'completed'))
      return tasks;
    await delay(40);
  }
  throw new Error('Simulation exceeded its time budget');
}
