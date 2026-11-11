import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Account } from '../types.ts';
import { resolveCodex } from './resolve-codex.ts';

// Protocol shape verified against codex 0.167.0-alpha.3.2 generate-ts --experimental.
// RPC values are validated at the Nexus tool boundary; provider notifications vary by version.
export class CodexConnection extends EventEmitter {
  private proc?: ChildProcessWithoutNullStreams;
  private pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private sequence = 0;
  private startPromise?: Promise<void>;
  constructor(
    readonly home: string,
    readonly executable?: string,
    private launchArgs?: string[],
  ) {
    super();
  }
  start() {
    return (this.startPromise ??= this.boot().catch((error) => {
      this.proc?.kill();
      this.startPromise = undefined;
      throw error;
    }));
  }
  private async boot() {
    await mkdir(this.home, { recursive: true });
    await writeFile(
      join(this.home, 'config.toml'),
      'cli_auth_credentials_store = "file"\n',
      { flag: 'wx' },
    ).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'EEXIST') throw e;
    });
    const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: this.home };
    // Do not accidentally authenticate isolated accounts using the launcher's credentials.
    for (const key of [
      'OPENAI_API_KEY',
      'CODEX_API_KEY',
      'CODEX_ACCESS_TOKEN',
      'OPENAI_ACCESS_TOKEN',
    ])
      delete env[key];
    this.proc = spawn(
      this.executable || resolveCodex(),
      this.launchArgs || [
        'app-server',
        '--listen',
        'stdio://',
        '-c',
        'cli_auth_credentials_store="file"',
      ],
      { env, windowsHide: true, stdio: 'pipe' },
    );
    const processForConnection = this.proc;
    this.proc.stderr.on('data', () => {}); // Never persist raw runtime logs/credentials.
    this.proc.stdin.on('error', () => {}); // Process exit rejects pending RPCs below.
    createInterface({ input: this.proc.stdout }).on('line', (line) => {
      try {
        this.receive(JSON.parse(line));
      } catch {
        /* ignore non-protocol diagnostics */
      }
    });
    const fail = () => {
      if (this.proc !== processForConnection) return;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error('Codex process disconnected'));
      }
      this.pending.clear();
      this.startPromise = undefined;
      this.proc = undefined;
      this.emit('disconnect');
    };
    this.proc.on('error', fail);
    this.proc.on('exit', fail);
    await this.request('initialize', {
      clientInfo: {
        name: 'agent_nexus',
        title: 'Agent Nexus',
        version: '0.1.0',
      },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized', params: {} });
  }
  private receive(msg: any) {
    if (msg.method && msg.id !== undefined) this.emit('request', msg);
    else if (msg.method) this.emit('notification', msg);
    else {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error)
        p.reject(new Error(msg.error.message || 'Codex RPC error'));
      else p.resolve(msg.result);
    }
  }
  private send(msg: unknown) {
    if (!this.proc?.stdin.writable) throw new Error('Codex is not connected');
    this.proc.stdin.write(JSON.stringify(msg) + '\n');
  }
  request(method: string, params: unknown = {}): Promise<any> {
    const requestId = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Codex ${method} timed out`));
      }, 30000);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.send({ id: requestId, method, params });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(e);
      }
    });
  }
  reply(requestId: number | string, result: unknown) {
    this.send({ id: requestId, result });
  }
  reject(requestId: number | string) {
    this.send({
      id: requestId,
      error: {
        code: -32601,
        message: 'Unsupported host request; no permissions granted',
      },
    });
  }
  stop() {
    this.proc?.kill();
  }
}

export class Accounts {
  private connections = new Map<string, CodexConnection>();
  constructor(
    private dataDir: string,
    private attach: (account: Account, c: CodexConnection) => void,
    private factory: (home: string) => CodexConnection = (home) =>
      new CodexConnection(home),
  ) {}
  async connection(account: Account) {
    if (account.provider !== 'codex')
      throw new Error('Mock account has no Codex connection');
    let c = this.connections.get(account.id);
    if (!c) {
      c = this.factory(join(this.dataDir, 'accounts', account.id));
      this.connections.set(account.id, c);
      this.attach(account, c);
    }
    await c.start();
    return c;
  }
  stop() {
    for (const c of this.connections.values()) c.stop();
  }
}
