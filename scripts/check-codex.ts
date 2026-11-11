import { resolve, join } from 'node:path';
import { CodexConnection } from '../src/providers/codex.ts';
import { dynamicTools } from '../src/tools.ts';
const connections = ['a', 'b', 'c'].map(
  (name) => new CodexConnection(resolve('.nexus', 'probe', name)),
);
try {
  for (let i = 0; i < connections.length; i++) {
    const c = connections[i];
    await c.start();
    const account = await c.request('account/read', { refreshToken: false });
    const models = await c.request('model/list', {});
    const thread = await c.request('thread/start', {
      cwd: resolve('.'),
      ephemeral: true,
      sandbox: 'read-only',
      approvalPolicy: 'on-request',
      config: {
        'agents.enabled': true,
        'agents.max_concurrent_threads_per_session': 1,
      },
      dynamicTools,
    });
    console.log(
      JSON.stringify({
        worker: i + 1,
        initialized: true,
        authenticated: Boolean(account.account),
        catalogModels: models.data?.length ?? 0,
        threadCreated: Boolean(thread.thread?.id),
        coordinationToolsAccepted: true,
        isolatedHome: c.home,
      }),
    );
  }
  console.log(
    'Three isolated app-server processes initialized. This probe does not log in or run inference; model catalogs do not prove account entitlement.',
  );
} finally {
  for (const c of connections) c.stop();
}
