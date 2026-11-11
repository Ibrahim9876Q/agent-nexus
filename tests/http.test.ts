import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import { WebSocket } from 'ws';
import { createNexusServer } from '../src/server.ts';
import { seedSimulation, waitForSimulation } from '../src/simulation.ts';
test(
  'HTTP and WebSocket enforce local origins and session token; API changes stream live',
  { timeout: 30000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexus-http-'));
    const nexus = await createNexusServer(root, 0);
    nexus.server.listen(0, '127.0.0.1');
    await once(nexus.server, 'listening');
    const address = nexus.server.address();
    if (!address || typeof address === 'string') throw new Error('No listener');
    const base = `http://127.0.0.1:${address.port}`;
    let ws: WebSocket | undefined;
    try {
      assert.equal((await fetch(base + '/api/state')).status, 401);
      assert.equal(
        (
          await fetch(base + '/api/session', {
            headers: { Origin: 'https://evil.example' },
          })
        ).status,
        403,
      );
      const badHost = await new Promise<number | undefined>(
        (resolve, reject) => {
          const req = request(
            base + '/api/session',
            { headers: { Host: 'evil.example' } },
            (res) => {
              res.resume();
              resolve(res.statusCode);
            },
          );
          req.on('error', reject);
          req.end();
        },
      );
      assert.equal(badHost, 403);
      const { token } = await (await fetch(base + '/api/session')).json();
      const headers = {
        'X-Nexus-Token': token,
        'Content-Type': 'application/json',
      };
      const denied = new WebSocket(
        base.replace('http', 'ws') + '/live?token=wrong',
      );
      denied.on('error', () => {});
      await once(denied, 'close').catch(() => {});
      assert.notEqual(denied.readyState, WebSocket.OPEN);
      ws = new WebSocket(base.replace('http', 'ws') + '/live?token=' + token);
      const first = once(ws, 'message');
      await once(ws, 'open');
      await first;
      const next = once(ws, 'message');
      const r = await fetch(base + '/api/accounts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'HTTP mock', provider: 'mock' }),
      });
      assert.equal(r.status, 200);
      const [snapshot] = await next;
      assert.equal(JSON.parse(String(snapshot)).accounts[0].name, 'HTTP mock');
      const bad = await fetch(base + '/api/accounts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Bad',
          provider: 'codex',
          concurrency: 1,
          nativeLimit: 2,
        }),
      });
      assert.equal(bad.status, 400);
      const state = await (
        await fetch(base + '/api/state', { headers })
      ).json();
      assert.equal(state.accounts.length, 1);
      assert.ok(!JSON.stringify(state).includes(token));
      const demo = await seedSimulation(nexus.engine);
      await waitForSimulation(nexus.engine, demo.project.id);
      const contributions = await (
        await fetch(base + `/api/projects/${demo.project.id}/contributions`, {
          headers,
        })
      ).json();
      assert.ok(
        contributions.some((c: { files: string[] }) =>
          c.files.includes('backend.mjs'),
        ),
      );
      assert.ok(
        contributions.some((c: { files: string[] }) =>
          c.files.includes('frontend.mjs'),
        ),
      );
    } finally {
      ws?.terminate();
      await nexus.close();
    }
  },
);
