import { resolve, join } from 'node:path';
import { Store } from '../src/db/store.ts';
import { Engine } from '../src/engine.ts';
import {
  executeMock,
  seedSimulation,
  waitForSimulation,
} from '../src/simulation.ts';
const data = resolve('.nexus', 'cli-demo');
const store = new Store(join(data, 'nexus.db'));
const engine = new Engine(store, data, { execute: executeMock });
try {
  const { project, repo } = await seedSimulation(engine);
  const tasks = await waitForSimulation(engine, project.id);
  console.log(
    JSON.stringify(
      {
        mode: 'mock',
        project: project.id,
        repo: repo.path,
        tasks: tasks.map((t) => ({
          title: t.title,
          status: t.status,
          worktree: t.worktree,
          branch: t.branch,
          output: t.output,
        })),
        messages: store
          .all('messages')
          .filter((m) => m.projectId === project.id),
        deliveries: store
          .all('deliveries')
          .filter(
            (d) => store.get('messages', d.messageId).projectId === project.id,
          ),
      },
      null,
      2,
    ),
  );
} finally {
  await engine.stop();
  store.close();
}
