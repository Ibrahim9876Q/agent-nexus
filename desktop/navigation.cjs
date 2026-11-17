const views = new Set(['Command', 'Brain', 'Agents', 'Output']);
const recordId = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

function externalLink(value, origin) {
  if (typeof value !== 'string' || value.length > 16384) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.origin === origin
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function viewUrl(origin, request) {
  if (!request || !views.has(request.view))
    throw new Error('Unknown workspace view');
  const url = new URL('/', origin);
  url.searchParams.set('view', request.view);
  for (const key of ['project', 'chat']) {
    const value = request[key];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || !recordId.test(value))
      throw new Error('Invalid workspace selection');
    url.searchParams.set(key, value);
  }
  if (!url.searchParams.has('project')) url.searchParams.delete('chat');
  return url.href;
}

function trustedPage(url, origin) {
  try {
    const page = new URL(url);
    return page.origin === origin && page.pathname === '/';
  } catch {
    return false;
  }
}

module.exports = { externalLink, trustedPage, viewUrl };
