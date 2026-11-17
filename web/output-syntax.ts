import { all, createLowlight } from 'lowlight';
import type { Root } from 'hast';

const highlighter = createLowlight(all);
const aliases: Record<string, string> = {
  cjs: 'js',
  mjs: 'js',
  cts: 'ts',
  mts: 'ts',
  jsx: 'js',
  tsx: 'ts',
  vue: 'html',
  svelte: 'html',
  mdx: 'markdown',
  svg: 'xml',
  jsonc: 'json',
  yml: 'yaml',
  cs: 'csharp',
  hpp: 'cpp',
  h: 'cpp',
  ps1: 'powershell',
  psm1: 'powershell',
  cmd: 'dos',
  bat: 'dos',
  zsh: 'bash',
  fish: 'bash',
  env: 'ini',
  tf: 'hcl',
  toml: 'ini',
};

export function fileLanguage(path: string) {
  const name = path.split(/[\\/]/).at(-1)?.toLowerCase() || '';
  if (name === 'dockerfile' || name.startsWith('dockerfile.'))
    return 'dockerfile';
  if (name === 'makefile' || name === 'gnumakefile') return 'makefile';
  return name.split('.').at(-1) || '';
}

type Token = { text: string; className?: string };

export function highlightLines(source: string, language: string): Token[][] {
  const name = language.toLowerCase();
  // Keep unknown formats and very large snippets readable as plain text.
  const plain = () => source.split('\n').map((text) => [{ text }]);
  const grammar = Object.hasOwn(aliases, name) ? aliases[name] : name;
  if (
    source.length > 120_000 ||
    (grammar && !highlighter.registered(grammar)) ||
    (!grammar && source.length > 12_000)
  )
    return plain();

  let tree;
  try {
    tree = grammar
      ? highlighter.highlight(grammar, source)
      : highlighter.highlightAuto(source, {
          subset: [
            'javascript',
            'typescript',
            'python',
            'bash',
            'powershell',
            'json',
            'yaml',
            'xml',
            'css',
            'sql',
            'rust',
            'go',
            'cpp',
            'java',
          ],
        });
  } catch {
    return plain();
  }
  const lines: Token[][] = [[]];
  function visit(node: Root['children'][number], classes: string[] = []) {
    if (node.type === 'element') {
      const extra = node.properties.className;
      const next = Array.isArray(extra)
        ? [...classes, ...extra.map(String)]
        : classes;
      node.children.forEach((child) => visit(child, next));
    } else if (node.type === 'text') {
      const className = classes.length ? classes.join(' ') : undefined;
      node.value.split('\n').forEach((text, index) => {
        if (index) lines.push([]);
        if (text) lines.at(-1)!.push({ text, className });
      });
    }
  }
  tree.children.forEach((node) => visit(node));
  return lines;
}

type DiffRow = {
  text: string;
  kind: 'add' | 'remove' | 'context' | 'heading' | 'meta';
  tokens?: Token[];
};

export function highlightPatch(patch: string, path: string): DiffRow[] {
  const language = fileLanguage(path);
  const rows: DiffRow[] = [];
  let oldSide: DiffRow[] = [];
  let newSide: DiffRow[] = [];
  let inHunk = false;
  function finishHunk() {
    // Parse the two versions separately so removed code cannot change how
    // added code is tokenized, including across multiline strings/comments.
    for (const side of [oldSide, newSide]) {
      if (!side.length) continue;
      const highlighted = highlightLines(
        side.map((row) => row.text.slice(1)).join('\n'),
        language,
      );
      side.forEach((row, index) => {
        row.tokens = highlighted[index];
      });
    }
    oldSide = [];
    newSide = [];
  }
  for (const text of patch.split('\n')) {
    if (text.startsWith('@@ ')) {
      finishHunk();
      inHunk = true;
      rows.push({ text, kind: 'heading' });
      continue;
    }
    const prefix = text[0];
    if (!inHunk || (prefix !== '+' && prefix !== '-' && prefix !== ' ')) {
      rows.push({ text, kind: 'meta' });
      continue;
    }
    const row: DiffRow = {
      text,
      kind: prefix === '+' ? 'add' : prefix === '-' ? 'remove' : 'context',
    };
    rows.push(row);
    if (prefix !== '+') oldSide.push(row);
    if (prefix !== '-') newSide.push(row);
  }
  finishHunk();
  return rows;
}
