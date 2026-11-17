import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { externalLink, trustedPage, viewUrl } = createRequire(import.meta.url)(
  '../desktop/navigation.cjs',
);

const origin = 'http://127.0.0.1:42117';
test('external links allow browser destinations and local previews, but not shell schemes or Nexus API routes', () => {
  for (const url of [
    'https://example.com/docs#setup',
    'http://localhost:8025/',
    'http://127.0.0.1:5173/?preview=1',
  ])
    assert.equal(externalLink(url, origin), url);
  for (const url of [
    'javascript:alert(1)',
    'file:///C:/Windows/system.ini',
    'data:text/html,test',
    'ms-settings:',
    '/api/session',
    origin + '/api/session',
    'https://user:password@example.com/',
  ])
    assert.equal(externalLink(url, origin), null, url);
});
test('pop-outs use distinct trusted app URLs and keep only a valid workspace and chat', () => {
  const project = '7d35466b-357e-424f-be54-b0071adf7339';
  const chat = '18e97d24-c9bd-4a9b-ab12-59430a5c989a';
  for (const view of ['Command', 'Brain', 'Agents', 'Output']) {
    const url = viewUrl(origin, {
      view,
      project,
      chat,
      redirect: 'https://example.com',
    });
    assert.equal(trustedPage(url, origin), true);
    assert.deepEqual(Object.fromEntries(new URL(url).searchParams), {
      view,
      project,
      chat,
    });
  }
  assert.equal(
    new URL(viewUrl(origin, { view: 'Agents', chat })).searchParams.has('chat'),
    false,
  );
  assert.throws(
    () => viewUrl(origin, { view: 'https://example.com' }),
    /Unknown workspace view/,
  );
  assert.throws(
    () => viewUrl(origin, { view: 'Brain', project: '../api/session' }),
    /Invalid workspace/,
  );
  assert.equal(trustedPage(origin + '/api/session', origin), false);
  assert.equal(trustedPage('http://localhost:5173/', origin), false);
});
