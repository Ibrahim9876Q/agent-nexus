import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, realpath } from 'node:fs/promises';
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
  constructor(private root: string) {}
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
