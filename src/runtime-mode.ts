import { resolve, join } from 'node:path';

export function runtimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
) {
  const mock = env.NEXUS_MOCK_INSTALLATION === '1';
  return {
    mock,
    dataDir: resolve(
      env.NEXUS_DATA_DIR ||
        join(cwd, '.nexus', mock ? 'mock-installation' : 'live'),
    ),
  };
}
