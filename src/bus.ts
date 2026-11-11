import { Store, id } from './db/store.ts';
import type { Message } from './types.ts';
export class Bus {
  constructor(private store: Store) {}
  send(
    senderId: string,
    recipientId: string,
    type: string,
    payload: unknown,
    dedupeKey: string = id(),
    correlationId: string = id(),
  ) {
    const sender = this.store.get('agents', senderId),
      recipient = this.store.get('agents', recipientId);
    if (sender.projectId !== recipient.projectId)
      throw new Error(
        'Cross-project messages require an explicit integration; access denied',
      );
    if (JSON.stringify(payload).length > 20000)
      throw new Error('Message exceeds 20 KB');
    const old = this.store
      .all('messages')
      .find(
        (m) =>
          m.projectId === sender.projectId &&
          m.sender === senderId &&
          m.dedupeKey === dedupeKey,
      );
    if (old) return old;
    const project = this.store.get('projects', sender.projectId);
    const message: Message = {
      id: id(),
      sender: senderId,
      recipient: recipientId,
      projectId: project.id,
      repoId: project.repoId,
      taskId: sender.taskId,
      type,
      timestamp: new Date().toISOString(),
      payload,
      dedupeKey,
      correlationId,
    };
    this.store.transaction(() => {
      this.store.put('messages', message);
      this.store.put('deliveries', {
        id: message.id,
        messageId: message.id,
        recipient: recipientId,
        status: 'queued',
        attempts: 0,
        nextAttempt: 0,
        expiresAt: Date.now() + 86400000,
      });
    });
    this.store.event('message.queued', { messageId: message.id, type });
    return message;
  }
  inbox(agentId: string) {
    return this.store
      .all('deliveries')
      .filter(
        (d) =>
          d.recipient === agentId &&
          d.status !== 'acknowledged' &&
          d.status !== 'expired',
      )
      .map((d) => this.store.get('messages', d.messageId));
  }
  ack(agentId: string, messageId: string) {
    const d = this.store.get('deliveries', messageId);
    if (d.recipient !== agentId)
      throw new Error('Acknowledgment identity mismatch');
    this.store.put('deliveries', { ...d, status: 'acknowledged' });
  }
  async pump(
    deliver: (agentId: string, message: Message) => Promise<boolean>,
    now = Date.now(),
  ) {
    for (const d of this.store.all('deliveries')) {
      if (d.status === 'acknowledged' || d.status === 'expired') continue;
      if (d.expiresAt <= now) {
        this.store.put('deliveries', { ...d, status: 'expired' });
        continue;
      }
      if (d.nextAttempt > now) continue;
      let accepted = false;
      try {
        accepted = await deliver(
          d.recipient,
          this.store.get('messages', d.messageId),
        );
      } catch {
        /* durable retry */
      }
      const current = this.store.get('deliveries', d.id);
      if (current.status === 'acknowledged') continue;
      this.store.put('deliveries', {
        ...current,
        status: accepted ? 'delivered' : 'queued',
        attempts: d.attempts + 1,
        nextAttempt: now + Math.min(60000, 1000 * 2 ** Math.min(d.attempts, 6)),
      });
    }
  }
}
