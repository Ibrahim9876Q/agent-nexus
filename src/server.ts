import express from 'express';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { Store } from './db/store.ts';
import { Engine } from './engine.ts';
import { git } from './integrations/git.ts';
import { Knowledge } from './integrations/knowledge.ts';
import { executeMock, seedSimulation } from './simulation.ts';
import { runtimeConfig } from './runtime-mode.ts';

export async function createNexusServer(
  dataDir = runtimeConfig().dataDir,
  port = Number(process.env.NEXUS_PORT || 4310),
  options: { mock?: boolean } = {},
) {
  const mock = options.mock ?? runtimeConfig().mock;
  const store = new Store(join(dataDir, 'nexus.db')),
    engine = new Engine(store, dataDir, mock ? { execute: executeMock } : {});
  const knowledge = new Knowledge(join(dataDir, 'knowledge'));
  const app = express(),
    server = createServer(app),
    wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const token = randomBytes(32).toString('hex');
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  server.on('listening', () => {
    const address = server.address();
    if (address && typeof address !== 'string') {
      hosts.clear();
      hosts.add(`127.0.0.1:${address.port}`);
      hosts.add(`localhost:${address.port}`);
    }
  });
  const validOrigin = (origin?: string) =>
    !origin || [...hosts].some((h) => origin === `http://${h}`);
  const validToken = (value: unknown) =>
    typeof value === 'string' &&
    value.length === token.length &&
    timingSafeEqual(Buffer.from(value), Buffer.from(token));
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (
      !hosts.has(req.headers.host || '') ||
      !validOrigin(req.headers.origin) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      res.status(403).json({ error: 'Local same-origin access only' });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '128kb' }));
  app.get('/api/session', (_req, res) => res.json({ token }));
  app.use('/api', (req, res, next) => {
    if (!validToken(req.headers['x-nexus-token'])) {
      res.status(401).json({ error: 'Missing local session token' });
      return;
    }
    next();
  });
  const snapshot = () => ({
    ...engine.snapshot(),
    installation: mock ? 'mock' : 'live',
  });
  app.get('/api/state', (_req, res) => res.json(snapshot()));
  app.get('/api/projects/:id/contributions', async (req, res) => {
    const p = store.get('projects', req.params.id),
      repo = store.get('repos', p.repoId),
      base = await git(repo.path, 'rev-parse', 'HEAD');
    const results = await Promise.all(
      store
        .all('tasks')
        .filter((t) => t.projectId === p.id && t.worktree)
        .map(async (t) => {
          try {
            const tracked = await git(
                t.worktree!,
                'diff',
                '--name-only',
                '-z',
                base,
              ),
              untracked = await git(
                t.worktree!,
                'ls-files',
                '--others',
                '--exclude-standard',
                '-z',
              );
            return {
              taskId: t.id,
              base,
              files: [
                ...new Set(
                  (tracked + '\0' + untracked).split('\0').filter(Boolean),
                ),
              ],
            };
          } catch {
            return { taskId: t.id, base, files: [], unavailable: true };
          }
        }),
    );
    res.json(results);
  });
  app.post('/api/command', async (req, res) =>
    res.json(await engine.command(req.body)),
  );
  app.post('/api/chats', (req, res) => {
    const v = z
      .object({
        projectId: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
      })
      .strict()
      .parse(req.body);
    res.json(engine.createChat(v.projectId, v.title));
  });
  app.post('/api/chats/:id', (req, res) => {
    const v = z
      .object({ title: z.string().min(1).max(200) })
      .strict()
      .parse(req.body);
    res.json(engine.renameChat(req.params.id, v.title));
  });
  app.post('/api/accounts', (req, res) => {
    if (
      (!mock && req.body.provider !== 'codex') ||
      (mock && req.body.provider !== 'mock')
    )
      throw new Error(
        'Live installations accept Codex accounts only; mock installations accept mock accounts only.',
      );
    res.json(engine.addAccount(req.body));
  });
  app.post('/api/accounts/:id/verify', async (req, res) =>
    res.json(await engine.verify(req.params.id)),
  );
  app.post('/api/accounts/:id/capacity', async (req, res) =>
    res.json(await engine.refreshCapacity(req.params.id)),
  );
  app.post('/api/accounts/:id/models', async (req, res) =>
    res.json(await engine.refreshModels(req.params.id)),
  );
  app.post('/api/accounts/:id/settings', async (req, res) =>
    res.json(await engine.updateSettings(req.params.id, req.body)),
  );
  app.post('/api/accounts/:id/admission', (req, res) => {
    const v = z.object({ enabled: z.boolean() }).strict().parse(req.body);
    res.json(engine.setAdmission(req.params.id, v.enabled));
  });
  app.post('/api/accounts/:id/login', async (req, res) =>
    res.json(await engine.login(req.params.id)),
  );
  app.post('/api/accounts/:id/logout', async (req, res) =>
    res.json(await engine.logout(req.params.id)),
  );
  app.post('/api/accounts/:id/cancel-login', async (req, res) =>
    res.json(await engine.cancelLogin(req.params.id)),
  );
  app.patch('/api/accounts/:id', (req, res) => {
    const input = z
      .object({
        concurrency: z.number().int().min(1).max(12),
        nativeLimit: z.number().int().min(0).max(4),
        maxDepth: z.number().int().min(1).max(5),
        maxAgents: z.number().int().min(1).max(30),
      })
      .strict()
      .parse(req.body);
    if (input.nativeLimit >= input.concurrency)
      throw new Error('Reserve at least one slot for the parent worker');
    if (
      store
        .all('agents')
        .some((a) => a.accountId === req.params.id && a.status === 'running')
    )
      throw new Error('Pause account work before changing limits');
    res.json(
      store.put('accounts', {
        ...store.get('accounts', req.params.id),
        ...input,
      }),
    );
  });
  app.post('/api/repos', async (req, res) => {
    const v = z
      .object({ path: z.string().min(1), name: z.string().min(1) })
      .strict()
      .parse(req.body);
    res.json(await engine.addRepo(v.path, v.name));
  });
  app.post('/api/projects', (req, res) => {
    const v = z
      .object({
        repoId: z.string().uuid(),
        name: z.string().min(1),
        objective: z.string().default(''),
        accountId: z.string().uuid(),
      })
      .strict()
      .parse(req.body);
    const account = store.get('accounts', v.accountId);
    if (account.status !== 'ready' || (!mock && account.provider !== 'codex'))
      throw new Error(
        'Sign into a real coordinator account before opening a workspace.',
      );
    const p = store.put('projects', {
      ...engine.addProject(
        v.repoId,
        v.name,
        v.objective || `Workspace: ${v.name}`,
      ),
      coordinatorAccountId: account.id,
    });
    res.json(p);
  });
  app.post('/api/projects/:id/pause', async (req, res) => {
    const v = z.object({ paused: z.boolean() }).strict().parse(req.body);
    await engine.pause(req.params.id, v.paused);
    res.json({ ok: true });
  });
  app.post('/api/tasks', (req, res) => {
    const v = z
      .object({
        accountId: z.string().uuid(),
        projectId: z.string().uuid(),
        role: z.string().min(1),
        title: z.string().min(1),
        prompt: z.string().min(1),
        dependencies: z.array(z.string().uuid()).default([]),
        permissions: z
          .enum(['read-only', 'workspace-write'])
          .default('workspace-write'),
        chatId: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.body);
    const a = engine.addAgent(
      v.accountId,
      v.projectId,
      v.role,
      undefined,
      v.permissions,
      v.chatId,
    );
    res.json(engine.addTask(a.id, v.title, v.prompt, v.dependencies));
  });
  app.post('/api/tasks/:id/resume', (req, res) => {
    engine.retry(req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/tasks/:id/stop', async (req, res) => {
    await engine.interrupt(req.params.id);
    res.json({ ok: true });
  });
  app.get('/api/tasks/:id/diff', async (req, res) => {
    const t = store.get('tasks', req.params.id);
    if (!t.worktree) throw new Error('No worktree yet');
    res.json(await engine.git.diff(t.worktree));
  });
  app.post('/api/tasks/:id/commit', async (req, res) => {
    const t = store.get('tasks', req.params.id);
    if (t.status !== 'completed' || !t.worktree)
      throw new Error('Complete and inspect the task first');
    res.json({ sha: await engine.git.commit(t.worktree, t.title) });
  });
  app.post('/api/tasks/:id/pr', async (req, res) => {
    const t = store.get('tasks', req.params.id);
    if (t.status !== 'completed' || !t.worktree || !t.branch)
      throw new Error('Complete and commit this task first');
    const approved = await engine.requestApproval(
      'publish',
      `Push ${t.branch} and create a draft pull request`,
      { taskId: t.id, branch: t.branch, title: t.title, output: t.output },
      t.id,
    );
    if (!approved) {
      res.status(409).json({ error: 'Publication was declined or expired' });
      return;
    }
    const bodyFile = join(dataDir, `pr-${t.id}.md`);
    await writeFile(
      bodyFile,
      `## Changes\n${t.title}\n\n## Agent report (verify before merge)\n${t.output || 'No report'}\n\n## Dependencies\n${t.dependencies.join(', ') || 'None'}\n\n## Risks\nHuman review required. Agent completion is not an integration approval.\n`,
    );
    res.json({
      url: await engine.git.publishPR(t.worktree, t.branch, t.title, bodyFile),
    });
  });
  app.post('/api/messages', (req, res) => {
    const v = z
      .object({
        sender: z.string().uuid(),
        recipient: z.string().uuid(),
        type: z.string().min(1).max(100),
        payload: z.string().min(1).max(20000),
      })
      .strict()
      .parse(req.body);
    res.json(engine.bus.send(v.sender, v.recipient, v.type, v.payload));
  });
  app.post('/api/agents/:id/delegate', (req, res) => {
    const v = z
      .object({
        role: z.string().min(1),
        title: z.string().min(1),
        prompt: z.string().min(1),
      })
      .strict()
      .parse(req.body);
    res.json(engine.delegate(req.params.id, v.role, v.title, v.prompt));
  });
  app.post('/api/agents/:id/retire', async (req, res) => {
    const a = store.get('agents', req.params.id);
    if (a.status === 'running')
      throw new Error(
        'Stop the task and wait for interruption before retiring',
      );
    if (
      a.taskId &&
      ['pending', 'blocked'].includes(store.get('tasks', a.taskId).status)
    )
      await engine.interrupt(a.taskId);
    res.json(store.put('agents', { ...a, status: 'retired' }));
  });
  app.post('/api/approvals/:id', (req, res) => {
    const v = z.object({ approved: z.boolean() }).strict().parse(req.body);
    engine.resolveApproval(req.params.id, v.approved);
    res.json({ ok: true });
  });
  app.get('/api/knowledge/:projectId', async (req, res) => {
    store.get('projects', req.params.projectId);
    res.json(
      await knowledge.search(req.params.projectId, String(req.query.q || '')),
    );
  });
  app.post('/api/knowledge/:projectId', async (req, res) => {
    store.get('projects', req.params.projectId);
    const v = z
      .object({ title: z.string().min(1), body: z.string().min(1) })
      .strict()
      .parse(req.body);
    res.json(await knowledge.add(req.params.projectId, v.title, v.body));
  });
  app.post('/api/demo', async (_req, res) => {
    if (!mock) {
      res
        .status(404)
        .json({ error: 'Simulation is disabled in the live application.' });
      return;
    }
    res.json(await seedSimulation(engine));
  });
  if (existsSync(resolve('dist/index.html'))) {
    app.use(express.static(resolve('dist')));
    app.get('/', (_req, res) => res.sendFile(resolve('dist/index.html')));
  } else {
    const { createServer: createVite } = await import('vite');
    const vite = await createVite({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    server.on('close', () => {
      void vite.close();
    });
  }
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(400).json({ error: err.message });
    },
  );
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (
      !hosts.has(req.headers.host || '') ||
      !validOrigin(req.headers.origin) ||
      url.pathname !== '/live' ||
      !validToken(url.searchParams.get('token'))
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
      ws.send(JSON.stringify(snapshot()));
    });
  });
  let broadcastTimer: NodeJS.Timeout | undefined;
  store.on('change', () => {
    broadcastTimer ??= setTimeout(() => {
      broadcastTimer = undefined;
      const state = JSON.stringify(snapshot());
      for (const client of wss.clients)
        if (
          client.readyState === WebSocket.OPEN &&
          client.bufferedAmount < 1000000
        )
          client.send(state);
    }, 100);
  });
  engine.start();
  // Refresh account readiness on restart without starting any inference task.
  for (const account of store
    .all('accounts')
    .filter((a) => a.provider === 'codex'))
    void engine.verify(account.id).catch(() => {});
  return {
    app,
    server,
    engine,
    store,
    async close() {
      if (broadcastTimer) clearTimeout(broadcastTimer);
      store.removeAllListeners('change');
      for (const client of wss.clients) client.terminate();
      wss.close();
      await engine.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.close();
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.NEXUS_PORT || 4310);
  const nexus = await createNexusServer(undefined, port);
  nexus.server.listen(port, '127.0.0.1', () => {
    const address = nexus.server.address();
    const actual = address && typeof address !== 'string' ? address.port : port;
    console.log(`Agent Nexus: http://127.0.0.1:${actual}`);
    process.send?.({ type: 'ready', port: actual });
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await nexus.close();
    process.exit(0);
  };
  process.on('SIGINT', () => {
    void stop();
  });
  process.on('SIGTERM', () => {
    void stop();
  });
  process.on('message', (message: unknown) => {
    if ((message as { type?: string })?.type === 'shutdown') void stop();
  });
}
