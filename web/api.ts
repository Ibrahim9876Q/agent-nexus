let token = '';
export function setSessionToken(value: string) {
  token = value;
}
export async function api(path: string, body?: unknown) {
  const response = await fetch('/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexus-Token': token },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}
export async function imageBlob(id: string) {
  const response = await fetch('/api/attachments/' + encodeURIComponent(id), {
    headers: { 'X-Nexus-Token': token },
  });
  if (!response.ok) throw new Error('Could not load image');
  return response.blob();
}
