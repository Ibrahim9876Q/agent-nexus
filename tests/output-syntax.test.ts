import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  highlightPatch,
  highlightLines,
  fileLanguage,
} from '../web/output-syntax.ts';

test('diff syntax preserves source text, markers and multiline state on each side', () => {
  const patch = [
    '--- a/example.ts',
    '+++ b/example.ts',
    '@@ -1,2 +1,3 @@',
    '-/* removed comment starts',
    '+const value = "new";',
    '+/* added comment starts',
    '  comment ends */',
  ].join('\n');
  const rows = highlightPatch(patch, 'src/example.ts');
  assert.equal(rows[0].kind, 'meta');
  assert.equal(rows[1].kind, 'meta');
  assert.equal(rows[2].kind, 'heading');
  assert.ok(
    rows[3].tokens?.some((token) => token.className?.includes('hljs-comment')),
  );
  assert.ok(
    rows[4].tokens?.some((token) => token.className?.includes('hljs-keyword')),
  );
  assert.ok(
    rows[4].tokens?.some((token) => token.className?.includes('hljs-string')),
  );
  assert.ok(
    rows[6].tokens?.some((token) => token.className?.includes('hljs-comment')),
  );
  for (const row of rows)
    if (row.tokens)
      assert.equal(
        row.tokens.map((token) => token.text).join(''),
        row.text.slice(1),
      );
});

test('unsupported code stays intact and shell, PowerShell, and common paths map to syntax', () => {
  assert.equal(fileLanguage('build/Dockerfile.local'), 'dockerfile');
  const code = 'a < b\r\n\n  c';
  assert.equal(
    highlightLines(code, 'unknown-format')
      .map((line) => line.map((token) => token.text).join(''))
      .join('\n'),
    code,
  );
  assert.ok(
    highlightLines('echo "$HOME"', 'bash')
      .flat()
      .some((token) => token.className?.includes('hljs-string')),
  );
  assert.ok(
    highlightLines('Get-Item "$env:Path"', 'powershell')
      .flat()
      .some((token) => token.className?.includes('hljs-string')),
  );
});
