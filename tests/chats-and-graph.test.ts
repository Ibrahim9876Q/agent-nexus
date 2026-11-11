import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, id } from '../src/db/store.ts';
import { Engine } from '../src/engine.ts';
import { migrateChats } from '../src/chats.ts';
import {
  accountAnchors,
  graphCenter,
  graphLayout,
  viewToWorld,
  workspaceGraph,
} from '../web/graph-model.ts';

test('legacy workspace history migrates into one chat without splitting tasks or changing stored output', async () => {
  const store = new Store(':memory:');
  const repo = store.put('repos', { id: id(), name: 'Repo', path: tmpdir() });
  const project = store.put('projects', {
    id: id(),
    repoId: repo.id,
    name: 'Workspace',
    objective: 'Existing work',
    status: 'active',
  });
  const account = store.put('accounts', {
    id: id(),
    name: 'A',
    provider: 'mock',
    status: 'ready',
    concurrency: 2,
    nativeLimit: 0,
    maxDepth: 3,
    maxAgents: 12,
  });
  const agent = store.put('agents', {
    id: id(),
    accountId: account.id,
    projectId: project.id,
    role: 'coordinator',
    depth: 0,
    kind: 'worker',
    permissions: 'workspace-write',
    status: 'completed',
    threadId: 'preserved-thread',
  });
  for (let n = 0; n < 9; n++)
    store.put('tasks', {
      id: id(),
      projectId: project.id,
      agentId: agent.id,
      title: 'Task ' + n,
      prompt: 'Existing prompt',
      dependencies: [],
      scope: [],
      priority: 0,
      status: 'completed',
      attempts: 1,
      output: 'Saved output ' + n,
    });
  for (const text of ['hi', 'Build the requested marketing website'])
    store.put('commands', {
      id: id(),
      projectId: project.id,
      text,
      mode: 'chat',
      at: new Date().toISOString(),
      targets: [agent.id],
      result: 'Saved receipt',
    });
  const before = store.all('tasks');
  migrateChats(store);
  migrateChats(store);
  assert.equal(store.all('chats').length, 1);
  const chat = store.all('chats')[0];
  assert.equal(chat.title, 'Build the requested marketing website');
  assert.ok(store.all('tasks').every((t) => t.chatId === chat.id));
  assert.ok(store.all('commands').every((c) => c.chatId === chat.id));
  assert.equal(store.get('agents', agent.id).threadId, 'preserved-thread');
  assert.deepEqual(
    store.all('tasks').map(({ chatId, ...task }) => task),
    before,
  );
  store.close();
});

test('multiple chats in one workflow have separate coordinators, tasks, messages and persisted names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexus-chats-'));
  const store = new Store(join(root, 'workspace.db'));
  const engine = new Engine(store, root);
  let secondChatId = '';
  try {
    const a = engine.addAccount({ name: 'A', provider: 'mock' });
    const b = engine.addAccount({ name: 'B', provider: 'mock' });
    const repo = store.put('repos', { id: id(), name: 'Repo', path: root });
    const project = engine.addProject(repo.id, 'Workflow', 'Shared repository');
    store.put('projects', { ...project, coordinatorAccountId: a.id });
    const chatA = engine.createChat(project.id),
      chatB = engine.createChat(project.id);
    secondChatId = chatB.id;
    assert.equal(
      store.all('tasks').length,
      0,
      'Creating chats must not start AI work',
    );
    const first = await engine.command({
      projectId: project.id,
      chatId: chatA.id,
      text: 'Build the interface',
    });
    const second = await engine.command({
      projectId: project.id,
      chatId: chatB.id,
      text: 'Investigate a separate idea',
    });
    assert.notEqual(first.targets[0], second.targets[0]);
    assert.equal(store.get('chats', chatA.id).title, 'Build the interface');
    const taskA = store.get('tasks', first.taskIds![0]),
      taskB = store.get('tasks', second.taskIds![0]);
    assert.equal(taskA.chatId, chatA.id);
    assert.equal(taskB.chatId, chatB.id);
    await engine.command({
      projectId: project.id,
      chatId: chatA.id,
      text: 'Focus on styling',
      mode: 'direct',
    });
    assert.match(store.get('tasks', taskA.id).prompt, /Focus on styling/);
    assert.equal(store.get('tasks', taskB.id).prompt, taskB.prompt);
    await assert.rejects(
      engine.tool(first.targets[0], 'nexus_send', {
        recipient: second.targets[0],
        type: 'DISCOVERY',
        payload: 'Wrong chat',
        dedupeKey: 'cross-chat',
      }),
      /Cross-chat/,
    );
    const peerA = engine.addAgent(
      a.id,
      project.id,
      'peer',
      undefined,
      'workspace-write',
      chatA.id,
    );
    assert.throws(
      () => engine.addTask(peerA.id, 'Bad dependency', 'Task', [taskB.id]),
      /Cross-chat/,
    );
    const team = (await engine.tool(first.targets[0], 'nexus_team', {})) as {
      agents: { chatId?: string }[];
      tasks: { chatId?: string }[];
    };
    assert.ok(team.agents.every((agent) => agent.chatId === chatA.id));
    assert.ok(team.tasks.every((task) => task.chatId === chatA.id));
    const child = engine.delegate(
      first.targets[0],
      'helper',
      'Help',
      'Inspect',
    );
    assert.equal(child.agent.chatId, chatA.id);
    assert.equal(child.task.chatId, chatA.id);
    const planned = engine.plan(first.targets[0], {
      tasks: [
        {
          key: 'review',
          accountId: b.id,
          role: 'reviewer',
          title: 'Review',
          prompt: 'Review changes',
          dependencies: [],
        },
      ],
    });
    assert.equal(planned[0].chatId, chatA.id);
    engine.renameChat(chatB.id, 'Research');
    const otherProject = engine.addProject(repo.id, 'Other', 'Other workspace');
    await assert.rejects(
      engine.command({
        projectId: otherProject.id,
        chatId: chatA.id,
        text: 'Wrong workspace',
      }),
      /another workspace/,
    );
    assert.equal(
      store.get('tasks', taskB.id).worktree,
      undefined,
      'New chats do not inherit another chat’s worktree',
    );
  } finally {
    await engine.stop();
    store.close();
  }
  const reloaded = new Store(join(root, 'workspace.db'));
  const restarted = new Engine(reloaded, root);
  try {
    assert.equal(reloaded.get('chats', secondChatId).title, 'Research');
    assert.equal(
      reloaded.all('chats').length,
      2,
      'Restart does not manufacture another chat',
    );
  } finally {
    await restarted.stop();
    reloaded.close();
  }
});

test('Brain places repository centrally and all accounts at regular outer polygon vertices', async () => {
  for (const count of [1, 2, 3, 4, 5, 6]) {
    const ids = Array.from({ length: count }, (_, i) => 'account-' + i);
    const positions = accountAnchors(ids);
    for (const point of Object.values(positions))
      assert.ok(
        Math.abs(
          Math.hypot(point.x - graphCenter.x, point.y - graphCenter.y) - 330,
        ) < 0.001,
      );
    if (count === 2) {
      assert.ok(Math.abs(positions[ids[0]].x - positions[ids[1]].x) < 0.001);
      assert.ok(
        positions[ids[0]].y < graphCenter.y &&
          positions[ids[1]].y > graphCenter.y,
      );
    }
    if (count > 2) {
      const sides = ids.map((id, i) =>
        Math.hypot(
          positions[id].x - positions[ids[(i + 1) % count]].x,
          positions[id].y - positions[ids[(i + 1) % count]].y,
        ),
      );
      assert.ok(sides.every((side) => Math.abs(side - sides[0]) < 0.001));
    }
  }
  const store = new Store(':memory:');
  const engine = new Engine(store, tmpdir());
  try {
    const used = engine.addAccount({ name: 'Used', provider: 'mock' });
    const unused = engine.addAccount({ name: 'Unused', provider: 'mock' });
    const repo = store.put('repos', { id: id(), name: 'Repo', path: tmpdir() });
    const project = engine.addProject(repo.id, 'P', 'Workflow');
    const agent = engine.addAgent(used.id, project.id, 'worker');
    const first = engine.addTask(agent.id, 'Task', 'Task');
    store.put('tasks', {
      ...first,
      status: 'completed',
      branch: 'shared-branch',
    });
    const second = engine.addTask(agent.id, 'Next', 'Next');
    store.put('tasks', { ...second, branch: 'shared-branch' });
    const graph = workspaceGraph(engine.snapshot(), project.id, [
      { taskId: first.id, files: ['app.ts'], base: '1234' },
    ]);
    assert.ok(
      graph.nodes.some((n) => n.id === unused.id),
      'Accounts appear even before receiving work',
    );
    assert.equal(
      graph.nodes.filter((n) => n.kind === 'branch').length,
      1,
      'Shared branch is represented once',
    );
    const layout = graphLayout(graph.nodes);
    assert.deepEqual(layout[repo.id], graphCenter);
    assert.ok(
      graph.nodes.every(
        (n) =>
          Number.isFinite(layout[n.id].x) && Number.isFinite(layout[n.id].y),
      ),
    );
    assert.ok(graph.edges.every((e) => layout[e.source] && layout[e.target]));
  } finally {
    await engine.stop();
    store.close();
  }
});

test('node dragging coordinates account for both zoom and pan', () => {
  const world = { x: 720, y: 530 },
    pan = { x: 85, y: -40 },
    scale = 2.5;
  const view = {
    x: (world.x - graphCenter.x) * scale + graphCenter.x + pan.x,
    y: (world.y - graphCenter.y) * scale + graphCenter.y + pan.y,
  };
  assert.deepEqual(viewToWorld(view, pan, scale), world);
  const moved = viewToWorld({ x: view.x + 100, y: view.y - 50 }, pan, scale);
  assert.deepEqual(moved, { x: world.x + 40, y: world.y - 20 });
});
