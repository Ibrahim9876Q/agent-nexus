import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const exec = promisify(execFile);
export async function git(cwd: string, ...args: string[]) {
  return (
    await exec('git', ['-C', cwd, ...args], {
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    })
  ).stdout.trim();
}
export class GitService {
  private preparations = new Map<string, Promise<string>>();
  constructor(private root: string) {}
  async prepare(path: string) {
    const canonical = await realpath(resolve(path));
    const key =
      process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    const existing = this.preparations.get(key);
    if (existing) return existing;
    const pending = this.prepareFolder(canonical);
    this.preparations.set(key, pending);
    try {
      return await pending;
    } finally {
      this.preparations.delete(key);
    }
  }
  private async prepareFolder(canonical: string) {
    if (!(await stat(canonical)).isDirectory())
      throw new Error('Choose a project folder');
    let top: string;
    try {
      top = await git(canonical, 'rev-parse', '--show-toplevel');
    } catch (error) {
      // Only initialize an empty, explicitly selected folder. Other Git errors
      // (permissions, missing executable, corrupt metadata) must surface.
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 128 ||
        !('stderr' in error) ||
        typeof error.stderr !== 'string' ||
        !error.stderr.includes('not a git repository')
      )
        throw error;
      if ((await readdir(canonical)).length)
        throw new Error(
          'This folder contains files but is not a Git repository. Commit it as a Git project first, or choose a new empty folder for automatic setup.',
        );
      await git(canonical, 'init', '-b', 'main');
      top = canonical;
    }
    if ((await realpath(top)).toLowerCase() !== canonical.toLowerCase())
      throw new Error('Select the repository root');
    let hasCommit = true;
    try {
      await git(canonical, 'rev-parse', '--verify', '--quiet', 'HEAD');
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 1)
        throw error;
      hasCommit = false;
    }
    if (!hasCommit) {
      if ((await readdir(canonical)).some((name) => name !== '.git'))
        throw new Error(
          'This repository has files but no commits. Commit your project files first, or choose a new empty folder for automatic setup.',
        );
      // Fresh installations need an identity for both this initial commit and
      // later agent commits. Respect existing identities; never change globals.
      for (const [key, fallback] of [
        ['user.name', 'Agent Nexus'],
        ['user.email', 'agent-nexus@localhost'],
      ]) {
        let configured = '';
        try {
          configured = await git(canonical, 'config', '--get', key);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !('code' in error) ||
            error.code !== 1
          )
            throw error;
        }
        if (!configured)
          await git(canonical, 'config', '--local', key, fallback);
      }
      await git(
        canonical,
        'commit',
        '--allow-empty',
        '--only',
        '-m',
        'Initialize project',
      );
    }
    return this.validate(canonical);
  }
  async validate(path: string) {
    const canonical = await realpath(resolve(path));
    const top = await git(canonical, 'rev-parse', '--show-toplevel');
    if ((await realpath(top)).toLowerCase() !== canonical.toLowerCase())
      throw new Error('Select the repository root');
    await git(canonical, 'rev-parse', 'HEAD');
    return canonical;
  }
  async worktree(repo: string, taskId: string) {
    if (!/^[a-f0-9-]{36}$/.test(taskId)) throw new Error('Invalid task ID');
    const branch = `nexus/${taskId}`;
    const path = resolve(this.root, taskId);
    await mkdir(this.root, { recursive: true });
    await git(repo, 'worktree', 'add', '-b', branch, path, 'HEAD');
    return { path, branch };
  }
  async diff(path: string) {
    return {
      tracked: await git(path, 'diff', 'HEAD', '--stat'),
      status: await git(path, 'status', '--short'),
    };
  }
  async commit(path: string, title: string) {
    await git(path, 'add', '--all');
    await git(path, 'commit', '-m', title);
    return git(path, 'rev-parse', 'HEAD');
  }
  async publishPR(
    path: string,
    branch: string,
    title: string,
    bodyFile: string,
  ) {
    await git(path, 'push', '-u', 'origin', branch);
    return (
      await exec(
        'gh',
        [
          'pr',
          'create',
          '--draft',
          '--head',
          branch,
          '--title',
          title,
          '--body-file',
          bodyFile,
        ],
        { cwd: path, windowsHide: true },
      )
    ).stdout.trim();
  }
}
