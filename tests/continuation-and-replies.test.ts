import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, id } from '../src/db/store.ts';
import { Engine } from '../src/engine.ts';
import { chatActivity } from '../src/chat-activity.ts';
import { publicHistoryReplies } from '../src/chat-replies.ts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatResponse } from '../web/ChatResponse';

const delay = () => new Promise((r) => setTimeout(r, 10));
test('historical repair restores only public replies paired with recorded user inputs', () => {
  const commands = [
    {
      id: 'a',
      text: 'Build the requested website',
      at: new Date(100000).toISOString(),
    },
    { id: 'b', text: 'Is it ready?', at: new Date(200000).toISOString() },
  ] as import('../src/types').Tables['commands'][];
  const replies = publicHistoryReplies(
    [
      {
        startedAt: 100,
        completedAt: 110,
        items: [
          {
            type: 'userMessage',
            content: [
              {
                type: 'text',
                text: 'Build the requested website\n\nWorkspace context: Test',
              },
            ],
          },
          { type: 'reasoning', content: ['private reasoning'] },
          { type: 'agentMessage', phase: 'commentary', text: 'Working update' },
          {
            type: 'agentMessage',
            phase: 'final_answer',
            text: 'The first saved reply.',
          },
        ],
      },
      {
        startedAt: 200,
        completedAt: 210,
        items: [
          {
            type: 'userMessage',
            content: [
              { type: 'text', text: 'User master directive: Is it ready?' },
            ],
          },
          {
            type: 'agentMessage',
            phase: 'final_answer',
            text: 'The second saved reply.',
          },
        ],
      },
      {
        startedAt: 220,
        completedAt: 230,
        items: [
          {
            type: 'userMessage',
            content: [
              {
                type: 'text',
                text: 'Untrusted coordination message about other work',
              },
            ],
          },
          {
            type: 'agentMessage',
            phase: 'final_answer',
            text: 'Unassociated reply',
          },
        ],
      },
    ],
    commands,
  );
  assert.deepEqual(
    [...replies.entries()],
    [
      ['a', 'The first saved reply.'],
      ['b', 'The second saved reply.'],
    ],
  );
  assert.doesNotMatch(
    JSON.stringify([...replies.values()]),
    /private|Working update|Unassociated/,
  );
});
async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await delay();
  assert.ok(check());
}
function seed(engine: Engine) {
  const a = engine.addAccount({ name: 'A', provider: 'mock' });
  const repo = engine.store.put('repos', {
    id: id(),
    name: 'Repo',
    path: tmpdir(),
  });
  const project = engine.addProject(repo.id, 'Workflow', 'Fixture work');
  engine.store.put('projects', { ...project, coordinatorAccountId: a.id });
  engine.git.worktree = async (_, taskId) => ({
    path: join(tmpdir(), taskId),
    branch: taskId,
  });
  return { a, project, chat: engine.createChat(project.id) };
}

test('messages submitted during work receive separate replies and Stop cancels queued replies', async () => {
  const store = new Store(':memory:');
  const releases = new Map<string, () => void>();
  const engine = new Engine(store, tmpdir(), {
    execute: (task) =>
      new Promise((resolve) =>
        releases.set(task.prompt, () => resolve('Reply to ' + task.prompt)),
      ),
  });
  try {
    const { project, chat } = seed(engine);
    const first = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'First question',
    });
    await engine.tick();
    await waitFor(() => releases.has('First question'));
    const second = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'Second question',
    });
    assert.equal(second.queued, true);
    assert.equal(store.all('tasks').length, 1);
    releases.get('First question')!();
    await waitFor(
      () => store.get('commands', first.id).reply?.state === 'completed',
    );
    assert.equal(
      store.get('commands', first.id).reply?.text,
      'Reply to First question',
    );
    await engine.tick();
    await waitFor(() => releases.has('Second question'));
    assert.equal(store.get('commands', second.id).queued, false);
    releases.get('Second question')!();
    await waitFor(
      () => store.get('commands', second.id).reply?.state === 'completed',
    );
    assert.equal(
      store.get('commands', second.id).reply?.text,
      'Reply to Second question',
    );
    assert.equal(
      store.get('commands', first.id).reply?.text,
      'Reply to First question',
    );
    const snapshot = { ...engine.snapshot(), installation: 'mock' as const };
    const firstHtml = renderToStaticMarkup(
      createElement(ChatResponse, {
        command: store.get('commands', first.id),
        state: snapshot,
      }),
    );
    const secondHtml = renderToStaticMarkup(
      createElement(ChatResponse, {
        command: store.get('commands', second.id),
        state: snapshot,
      }),
    );
    assert.match(firstHtml, /Reply to First question/);
    assert.doesNotMatch(firstHtml, /Reply to Second question/);
    assert.match(secondHtml, /Reply to Second question/);
    const third = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'Third question',
    });
    await engine.tick();
    await waitFor(() => releases.has('Third question'));
    const fourth = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'Fourth question',
    });
    await engine.stopChat(chat.id);
    releases.get('Third question')!();
    await waitFor(
      () => store.get('commands', third.id).reply?.state === 'interrupted',
    );
    assert.equal(store.get('commands', fourth.id).reply?.state, 'interrupted');
    assert.equal(store.get('commands', fourth.id).queued, false);
    await engine.tick();
    assert.equal(releases.has('Fourth question'), false);
  } finally {
    for (const release of releases.values()) release();
    await engine.stop();
    store.close();
  }
});

test('restart recovery stays idle until requested and Resume reactivates the selected chat', async () => {
  const store = new Store(':memory:');
  const firstEngine = new Engine(store, tmpdir());
  const { project, chat } = seed(firstEngine);
  const other = firstEngine.createChat(project.id);
  const first = await firstEngine.command({
    projectId: project.id,
    chatId: chat.id,
    text: 'Original work',
  });
  const second = await firstEngine.command({
    projectId: project.id,
    chatId: other.id,
    text: 'Other work',
  });
  await firstEngine.stop();
  let starts = 0;
  const engine = new Engine(store, tmpdir(), {
    execute: async () => {
      starts++;
      return 'Resumed successfully';
    },
  });
  engine.git.worktree = async (_, taskId) => ({
    path: join(tmpdir(), taskId),
    branch: taskId,
  });
  try {
    await engine.tick();
    assert.equal(starts, 0);
    assert.equal(chatActivity(engine.snapshot(), chat.id).state, 'paused');
    const control = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'resume scheduling, please continue',
    });
    assert.equal(control.reply?.kind, 'status');
    assert.equal(control.reply?.state, 'completed');
    await engine.tick();
    await waitFor(() => starts === 1);
    assert.equal(store.get('tasks', second.taskIds![0]).recoveryHold, true);
    assert.equal(store.get('tasks', second.taskIds![0]).status, 'pending');
    await waitFor(
      () => store.get('tasks', first.taskIds![0]).status === 'completed',
    );
    await engine.command({
      projectId: project.id,
      chatId: other.id,
      text: 'Continue the other work',
    });
    assert.equal(store.get('tasks', second.taskIds![0]).recoveryHold, false);
    await engine.tick();
    await waitFor(() => starts === 2);
    await engine.tick();
    await waitFor(() => starts === 3);
    await engine.pause(project.id, true);
    await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'A message while manually paused',
    });
    assert.equal(store.get('projects', project.id).pauseReason, 'user');
    assert.equal(chatActivity(engine.snapshot(), chat.id).state, 'paused');
  } finally {
    await engine.stop();
    store.close();
  }
});

test('preview and revision requests wake completed workers and their result wakes the waiting coordinator', async () => {
  const store = new Store(':memory:');
  const engine = new Engine(store, tmpdir(), {
    execute: async (task, agent, e) => {
      const inbox = e.bus.inbox(agent.id);
      assert.ok(inbox.length > 0);
      for (const message of inbox) e.bus.ack(agent.id, message.id);
      return agent.role === 'coordinator'
        ? 'Preview result received.'
        : 'Preview fixture ready.';
    },
  });
  try {
    const { a, project, chat } = seed(engine);
    const command = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'Build a website',
    });
    const root = store.get('tasks', command.taskIds![0]);
    const child = engine.plan(root.agentId, {
      tasks: [
        {
          key: 'build',
          accountId: a.id,
          role: 'implementer',
          title: 'Build website',
          prompt: 'Build',
          dependencies: [],
        },
      ],
    })[0];
    for (const task of [root, child]) {
      store.put('tasks', {
        ...task,
        status: 'completed',
        attempts: 1,
        output: 'Earlier report',
        worktree: tmpdir(),
      });
      store.put('agents', {
        ...store.get('agents', task.agentId),
        status: 'completed',
      });
    }
    engine.bus.send(
      root.agentId,
      child.agentId,
      'preview_request',
      'Start the preview fixture',
      'preview',
    );
    engine.bus.send(
      root.agentId,
      child.agentId,
      'revision_request',
      'Apply the requested adjustment',
      'revision',
    );
    for (const delivery of store.all('deliveries'))
      store.put('deliveries', { ...delivery, nextAttempt: Date.now() + 60000 });
    engine.resumeChat(chat.id);
    assert.ok(
      store.all('deliveries').every((d) => d.nextAttempt === 0),
      'Resume retries queued deliveries immediately',
    );
    for (let i = 0; i < 8; i++) {
      await engine.tick();
      await delay();
    }
    assert.equal(store.get('tasks', child.id).attempts, 2);
    assert.equal(store.get('tasks', root.id).attempts, 2);
    assert.equal(
      store.get('commands', command.id).reply?.text,
      'Preview result received.',
    );
    assert.ok(
      store.all('deliveries').every((d) => d.status === 'acknowledged'),
    );
    engine.bus.send(
      root.agentId,
      child.agentId,
      'STATUS',
      'FYI, work is complete',
      'information',
    );
    await engine.tick();
    await delay();
    assert.equal(
      store.get('tasks', child.id).attempts,
      2,
      'Informational updates must not create a continuation loop',
    );
    assert.equal(chatActivity(engine.snapshot(), chat.id).busy, false);
    engine.bus.send(
      root.agentId,
      child.agentId,
      'preview_request',
      'Another preview request',
      'cancelled-preview',
    );
    assert.equal(chatActivity(engine.snapshot(), chat.id).busy, true);
    await engine.stopChat(chat.id);
    await engine.tick();
    await delay();
    assert.equal(store.get('tasks', child.id).attempts, 2);
  } finally {
    await engine.stop();
    store.close();
  }
});

test('activity distinguishes thinking, tools, approval, pause, waiting and completion', async () => {
  const store = new Store(':memory:');
  const engine = new Engine(store, tmpdir());
  try {
    const { project, chat } = seed(engine);
    const command = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'Test status',
    });
    const task = store.get('tasks', command.taskIds![0]);
    assert.equal(chatActivity(engine.snapshot(), chat.id).state, 'queued');
    store.put('tasks', {
      ...task,
      status: 'running',
      heartbeat: Date.now(),
      runtimeStage: 'Running command: npm test',
    });
    assert.equal(
      chatActivity(engine.snapshot(), chat.id).text,
      'Running command: npm test',
    );
    assert.equal(chatActivity(engine.snapshot(), chat.id).busy, true);
    const approval = store.put('approvals', {
      id: id(),
      kind: 'codex',
      description: 'Approval',
      detail: {},
      taskId: task.id,
      status: 'pending',
    });
    assert.equal(chatActivity(engine.snapshot(), chat.id).state, 'approval');
    assert.equal(chatActivity(engine.snapshot(), chat.id).busy, false);
    store.put('approvals', { ...approval, status: 'approved' });
    store.put('tasks', {
      ...task,
      status: 'blocked',
      waitingReason: 'Waiting for the preview worker',
    });
    assert.equal(
      chatActivity(engine.snapshot(), chat.id).text,
      'Waiting for the preview worker',
    );
    store.put('tasks', { ...task, status: 'completed' });
    assert.equal(chatActivity(engine.snapshot(), chat.id).state, 'idle');
  } finally {
    await engine.stop();
    store.close();
  }
});

test('custom worker replies wake a finished coordinator and blocked workers report their reason once', async () => {
  const store = new Store(':memory:');
  const engine = new Engine(store, tmpdir(), {
    execute: async (task, agent, e) => {
      for (const message of e.bus.inbox(agent.id))
        e.bus.ack(agent.id, message.id);
      if (agent.role !== 'coordinator') {
        e.bus.send(
          agent.id,
          store.get('tasks', task.parentTaskId!).agentId,
          'source_artifact',
          'Corrected source files',
        );
        await e.tool(agent.id, 'nexus_wait', {
          reason: 'Preview blocked by host policy; awaiting acknowledgement',
        });
        return 'Corrected files sent; preview unavailable';
      }
      return 'Received the files and surfaced the preview blocker';
    },
  });
  try {
    const { a, project, chat } = seed(engine);
    const command = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'Continue preview',
    });
    const parent = store.get('tasks', command.taskIds![0]);
    const child = engine.plan(parent.agentId, {
      tasks: [
        {
          key: 'preview',
          accountId: a.id,
          role: 'implementer',
          title: 'Preview',
          prompt: 'Preview',
          dependencies: [],
        },
      ],
    })[0];
    for (const task of [parent, child]) {
      store.put('tasks', {
        ...task,
        status: 'completed',
        attempts: 1,
        worktree: tmpdir(),
      });
      store.put('agents', {
        ...store.get('agents', task.agentId),
        status: 'completed',
      });
    }
    engine.bus.send(
      parent.agentId,
      child.agentId,
      'revision_request',
      'Fix the source files',
    );
    await engine.tick();
    await waitFor(() => store.get('tasks', child.id).status === 'blocked');
    assert.equal(
      store.all('messages').filter((m) => m.type === 'BLOCKED').length,
      1,
    );
    assert.match(
      JSON.stringify(
        store.all('messages').find((m) => m.type === 'BLOCKED')!.payload,
      ),
      /host policy/,
    );
    await engine.tick();
    await waitFor(() => store.get('tasks', parent.id).attempts === 2);
    assert.match(
      store.get('commands', command.id).reply!.text,
      /surfaced the preview blocker/,
    );
    await engine.tick();
    await delay();
    assert.equal(store.get('tasks', child.id).attempts, 2);
    assert.equal(
      store.all('messages').filter((m) => m.type === 'BLOCKED').length,
      1,
    );
  } finally {
    await engine.stop();
    store.close();
  }
});

test('Auto team records one lead item, runs two peer accounts, and reviews their evidence in the same chat', async () => {
  const store = new Store(':memory:');
  const engine = new Engine(store, tmpdir(), {
    execute: async (task, agent, e) => {
      if (agent.role === 'coordinator') {
        const command = store.get('commands', task.replyCommandId!);
        if (!command.teamPlan) {
          const plan = {
            tasks: accounts.map((account, index) => ({
              key: 'item-' + index,
              accountId: account.id,
              role: index ? 'worker' : 'coordinator',
              title: ['Integration', 'Interface', 'Tests'][index],
              prompt: [
                'Split by interface and validation.',
                'Prepare interface.',
                'Validate interface.',
              ][index],
              dependencies: [],
            })),
          };
          await assert.rejects(
            e.tool(agent.id, 'nexus_plan', { tasks: plan.tasks.slice(0, 2) }),
            /each available/,
          );
          const result = await e.tool(agent.id, 'nexus_plan', plan);
          assert.deepEqual(
            await e.tool(agent.id, 'nexus_plan', plan),
            result,
            'Repeated plan does not duplicate work',
          );
          return 'Coordinator completed integration';
        }
        for (const message of e.bus.inbox(agent.id))
          e.bus.ack(agent.id, message.id);
        return command.teamReviewStarted
          ? 'Reviewed interface and test results'
          : 'Waiting for the other report';
      }
      if (task.title === 'Interface') {
        const peer = store.all('tasks').find((row) => row.title === 'Tests')!;
        await e.tool(agent.id, 'nexus_send', {
          recipient: peer.agentId,
          type: 'INTERFACE_READY',
          payload: 'Use the shared interface contract',
          dedupeKey: 'interface-ready',
        });
        return 'Interface implemented';
      }
      await delay();
      const inbox = (await e.tool(
        agent.id,
        'nexus_inbox',
        {},
      )) as import('../src/types').Message[];
      assert.ok(
        inbox.some(
          (message) => message.payload === 'Use the shared interface contract',
        ),
      );
      for (const message of inbox) e.bus.ack(agent.id, message.id);
      return 'Tests passed';
    },
  });
  engine.git.worktree = async (_, taskId) => ({
    path: tmpdir(),
    branch: taskId,
  });
  const accounts = ['boss', 'frontend', 'quality'].map((name) =>
    engine.addAccount({ name: name + '@example.test', provider: 'mock' }),
  );
  try {
    const repo = store.put('repos', {
      id: id(),
      name: 'Fixture',
      path: tmpdir(),
    });
    const project = engine.addProject(repo.id, 'Fixture', 'Team work');
    store.put('projects', { ...project, coordinatorAccountId: accounts[0].id });
    const command = await engine.command({
      projectId: project.id,
      text: 'Build and test a feature',
    });
    assert.equal(command.autoTeam, true);
    for (let i = 0; i < 20; i++) {
      await engine.tick();
      await delay();
    }
    const state = { ...engine.snapshot(), installation: 'mock' as const };
    const saved = store.get('commands', command.id);
    assert.equal(saved.teamPlan?.leadTask, 'Integration');
    assert.equal(saved.teamPlan?.workerTaskIds.length, 2);
    assert.equal(saved.teamReviewStarted, true);
    assert.equal(saved.reply?.accountId, accounts[0].id);
    assert.equal(saved.reply?.text, 'Reviewed interface and test results');
    assert.equal(saved.reply?.state, 'completed');
    assert.equal(state.tasks.length, 3);
    assert.ok(
      state.tasks.every(
        (task) => task.status === 'completed' && task.chatId === command.chatId,
      ),
    );
    const html = renderToStaticMarkup(
      createElement(ChatResponse, { command: saved, state }),
    );
    for (const content of [
      'boss@example.test',
      'frontend@example.test',
      'quality@example.test',
      'Use the shared interface contract',
      'Split by interface and validation.',
      'Reviewed interface and test results',
    ]) {
      assert.ok(html.includes(content), content);
    }
    const solo = await engine.command({
      projectId: project.id,
      text: 'One account only',
      accountId: accounts[0].id,
    });
    assert.equal(solo.autoTeam, false);
  } finally {
    await engine.stop();
    store.close();
  }
});
