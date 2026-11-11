// Deterministic wire-protocol fixture, never loaded by the application.
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
let authenticated = false,
  thread,
  turnSequence = 0,
  turnId,
  threadOptions,
  turnOptions,
  waitingApproval = false;
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const result = (id, value) => send({ id, result: value });
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize')
    return result(m.id, { userAgent: 'protocol-test' });
  if (m.method === 'initialized') return;
  if (m.method === 'account/read')
    return result(m.id, {
      account: authenticated
        ? {
            type: 'chatgpt',
            email: 'fixture@example.invalid',
            planType: 'plus',
          }
        : null,
    });
  if (m.method === 'account/login/start') {
    authenticated = true;
    result(m.id, {
      type: 'chatgpt',
      authUrl: 'https://auth.openai.com/fixture',
      loginId: 'fixture-login',
    });
    return send({
      method: 'account/login/completed',
      params: { success: true, loginId: 'fixture-login' },
    });
  }
  if (m.method === 'account/logout') {
    authenticated = false;
    return result(m.id, {});
  }
  if (m.method === 'account/rateLimits/read')
    return result(m.id, {
      rateLimits: {
        primary: {
          usedPercent: 23,
          windowDurationMins: 300,
          resetsAt: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    });
  if (m.method === 'model/list') {
    const model = (id, efforts) => ({
      id,
      model: id,
      displayName: id,
      isDefault: id === 'fixture-model-a',
      defaultReasoningEffort: 'medium',
      supportedReasoningEfforts: efforts.map((reasoningEffort) => ({
        reasoningEffort,
        description: 'Protocol fixture effort ' + reasoningEffort,
      })),
    });
    return result(
      m.id,
      m.params.cursor
        ? {
            data: [
              model('fixture-model-b', ['medium', 'high', 'max', 'ultra']),
            ],
            nextCursor: null,
          }
        : {
            data: [model('fixture-model-a', ['low', 'medium', 'high'])],
            nextCursor: 'second-page',
          },
    );
  }
  if (m.method === 'thread/start' || m.method === 'thread/resume') {
    if (!authenticated)
      return send({ id: m.id, error: { message: 'Sign in required' } });
    threadOptions = m.params;
    thread = {
      id: m.params.threadId || 'thread-' + process.pid,
      cwd: m.params.cwd,
    };
    if (
      m.method === 'thread/start' &&
      !m.params.dynamicTools?.some((t) => t.name === 'nexus_team')
    )
      throw new Error('Missing coordination tools');
    return result(m.id, {
      thread,
      model: m.params.model || 'fixture-model-a',
      reasoningEffort: 'medium',
    });
  }
  if (m.method === 'turn/start') {
    turnId = 'turn-' + process.pid + '-' + ++turnSequence;
    turnOptions = m.params;
    result(m.id, { turn: { id: turnId, status: 'inProgress' } });
    send({
      method: 'turn/started',
      params: { threadId: thread.id, turn: { id: turnId } },
    });
    fs.writeFileSync(
      path.join(thread.cwd, 'runtime-params.json'),
      JSON.stringify({ thread: threadOptions, turn: turnOptions }),
    );
    if (m.params.input[0].text.includes('EXERCISE_APPROVAL')) {
      waitingApproval = true;
      return send({
        id: 'fixture-approval',
        method: 'item/commandExecution/requestApproval',
        params: { threadId: thread.id, command: 'node --version' },
      });
    }
    send({
      method: 'item/completed',
      params: {
        threadId: thread.id,
        item: {
          id: 'fixture-command',
          type: 'commandExecution',
          command: 'node --version',
          status: 'completed',
          exitCode: 0,
          durationMs: 20,
        },
      },
    });
    return send({
      id: 'fixture-tool',
      method: 'item/tool/call',
      params: { threadId: thread.id, tool: 'nexus_team', arguments: {} },
    });
  }
  if (m.id === 'fixture-approval' && m.result && waitingApproval) {
    waitingApproval = false;
    fs.writeFileSync(
      path.join(thread.cwd, 'approval-decision.json'),
      JSON.stringify(m.result),
    );
    return send({
      id: 'fixture-tool',
      method: 'item/tool/call',
      params: { threadId: thread.id, tool: 'nexus_team', arguments: {} },
    });
  }
  if (m.id === 'fixture-tool' && m.result) {
    if (!m.result.success) throw new Error('Host tool failed');
    fs.writeFileSync(
      path.join(thread.cwd, 'protocol-evidence.txt'),
      'Written by the wire-protocol test fixture; not AI output.\n',
    );
    send({
      method: 'item/started',
      params: {
        threadId: thread.id,
        item: {
          id: 'progress-' + turnId,
          type: 'agentMessage',
          phase: 'commentary',
          text: '',
        },
      },
    });
    send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: thread.id,
        itemId: 'progress-' + turnId,
        delta: 'Checking the protocol fixture.',
      },
    });
    send({
      method: 'item/reasoning/summaryTextDelta',
      params: {
        threadId: thread.id,
        itemId: 'thinking',
        delta: 'Public fixture summary.',
      },
    });
    send({
      method: 'item/reasoning/textDelta',
      params: { threadId: thread.id, delta: 'RAW_REASONING_MUST_NOT_PERSIST' },
    });
    const totals = (n) => ({
      totalTokens: n,
      inputTokens: n * 0.8,
      cachedInputTokens: 0,
      outputTokens: n * 0.2,
      reasoningOutputTokens: n * 0.1,
    });
    send({
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: thread.id,
        turnId,
        tokenUsage: {
          total: totals((turnSequence - 1) * 200 + 100),
          last: totals(100),
        },
      },
    });
    send({
      method: 'item/started',
      params: {
        threadId: thread.id,
        item: {
          id: 'answer-' + turnId,
          type: 'agentMessage',
          phase: 'final_answer',
          text: '',
        },
      },
    });
    send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: thread.id,
        itemId: 'answer-' + turnId,
        delta: 'Protocol fixture completed host tool call.',
      },
    });
    send({
      method: 'item/completed',
      params: {
        threadId: thread.id,
        item: {
          id: 'answer-' + turnId,
          type: 'agentMessage',
          phase: 'final_answer',
          text: 'Protocol fixture completed host tool call.',
        },
      },
    });
    const usage = {
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: thread.id,
        turnId,
        tokenUsage: { total: totals(turnSequence * 200), last: totals(100) },
      },
    };
    send(usage);
    send(usage);
    return send({
      method: 'turn/completed',
      params: {
        threadId: thread.id,
        turn: { id: turnId, status: 'completed' },
      },
    });
  }
  send({
    id: m.id,
    error: { message: 'Unsupported fixture method: ' + m.method },
  });
});
