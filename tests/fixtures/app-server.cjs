// Deterministic wire-protocol fixture, never loaded by the application.
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
let authenticated = false,
  thread;
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
  if (m.method === 'thread/start') {
    if (!authenticated)
      return send({ id: m.id, error: { message: 'Sign in required' } });
    thread = { id: 'thread-' + process.pid, cwd: m.params.cwd };
    if (!m.params.dynamicTools?.some((t) => t.name === 'nexus_team'))
      throw new Error('Missing coordination tools');
    return result(m.id, { thread });
  }
  if (m.method === 'turn/start') {
    result(m.id, { turn: { id: 'turn-' + process.pid, status: 'inProgress' } });
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
  if (m.id === 'fixture-tool' && m.result) {
    if (!m.result.success) throw new Error('Host tool failed');
    fs.writeFileSync(
      path.join(thread.cwd, 'protocol-evidence.txt'),
      'Written by the wire-protocol test fixture; not AI output.\n',
    );
    send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: thread.id,
        delta: 'Protocol fixture completed host tool call.',
      },
    });
    return send({
      method: 'turn/completed',
      params: {
        threadId: thread.id,
        turn: { id: 'turn-' + process.pid, status: 'completed' },
      },
    });
  }
  send({
    id: m.id,
    error: { message: 'Unsupported fixture method: ' + m.method },
  });
});
