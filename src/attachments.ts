import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { Store, id } from './db/store.ts';

export const attachmentInput = z
  .object({
    projectId: z.string().uuid(),
    chatId: z.string().uuid(),
    name: z.string().min(1).max(300),
    base64: z
      .string()
      .min(1)
      .max(14 * 1024 * 1024),
  })
  .strict();
export async function saveAttachment(
  store: Store,
  dataDir: string,
  input: unknown,
) {
  const value = attachmentInput.parse(input);
  const chat = store.get('chats', value.chatId);
  if (chat.projectId !== value.projectId)
    throw new Error('Attachment chat belongs to another workspace');
  if (
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value.base64) ||
    value.base64.length % 4 !== 0
  )
    throw new Error('Invalid image encoding');
  const bytes = Buffer.from(value.base64, 'base64');
  if (!bytes.length || bytes.length > 10 * 1024 * 1024)
    throw new Error('Images must be at most 10 MB each');
  const format = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? { mime: 'image/png', extension: 'png' }
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? { mime: 'image/jpeg', extension: 'jpg' }
      : bytes.toString('ascii', 0, 4) === 'RIFF' &&
          bytes.toString('ascii', 8, 12) === 'WEBP'
        ? { mime: 'image/webp', extension: 'webp' }
        : undefined;
  if (!format) throw new Error('Attach a PNG, JPEG, or WebP image');
  const key = id();
  const folder = join(dataDir, 'attachments');
  await mkdir(folder, { recursive: true });
  const path = join(folder, key + '.' + format.extension);
  await writeFile(path, bytes, { flag: 'wx' });
  return store.put('attachments', {
    id: key,
    projectId: chat.projectId,
    chatId: chat.id,
    name: basename(value.name.replaceAll('\\', '/')),
    mime: format.mime,
    size: bytes.length,
    path,
    createdAt: new Date().toISOString(),
  });
}
