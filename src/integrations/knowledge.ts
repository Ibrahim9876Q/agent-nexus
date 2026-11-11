import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { id } from '../db/store.ts';
// Unique, immutable note files avoid concurrent overwrites. No automatic transcript export.
export class Knowledge {
  constructor(private root: string) {}
  async add(projectId: string, title: string, body: string) {
    if (!/^[a-f0-9-]{36}$/.test(projectId)) throw new Error('Invalid project');
    if (body.length > 20000 || title.length > 200)
      throw new Error('Note too large');
    if (
      /sk-[a-zA-Z0-9]{16,}|gh[pousr]_[a-zA-Z0-9]{20,}|Bearer\s+\S+|"(?:access_token|refresh_token)"\s*:/i.test(
        body,
      )
    )
      throw new Error('Potential credential found; remove it before saving');
    const folder = join(this.root, projectId);
    await mkdir(folder, { recursive: true });
    const noteId = id();
    await writeFile(
      join(folder, `${noteId}.md`),
      `# ${title.replace(/[\r\n]/g, ' ')}\n\n${body}\n`,
      { flag: 'wx' },
    );
    return { id: noteId, title };
  }
  async search(projectId: string, query: string) {
    if (!/^[a-f0-9-]{36}$/.test(projectId)) throw new Error('Invalid project');
    const folder = join(this.root, projectId);
    const files = await readdir(folder).catch(() => []);
    const results = [];
    for (const file of files
      .filter((f) => /^[a-f0-9-]{36}\.md$/.test(f))
      .slice(0, 500)) {
      const body = await readFile(join(folder, file), 'utf8');
      if (body.toLowerCase().includes(query.toLowerCase()))
        results.push({ id: file, body: body.slice(0, 4000) });
    }
    return results.slice(0, 50);
  }
}
