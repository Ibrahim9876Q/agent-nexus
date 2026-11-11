import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Tables } from '../types.ts';
export const id = () => randomUUID();
export class Store extends EventEmitter {
  db: DatabaseSync;
  constructor(path: string) {
    super();
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      readFileSync(new URL('./migration.sql', import.meta.url), 'utf8'),
    );
  }
  all<K extends keyof Tables>(table: K): Tables[K][] {
    return this.db
      .prepare('SELECT body FROM records WHERE collection=? ORDER BY rowid')
      .all(table)
      .map((r) => JSON.parse(r.body as string));
  }
  get<K extends keyof Tables>(table: K, key: string): Tables[K] {
    const r = this.db
      .prepare('SELECT body FROM records WHERE collection=? AND id=?')
      .get(table, key);
    if (!r) throw new Error(`${table}: unknown ID`);
    return JSON.parse(r.body as string);
  }
  put<K extends keyof Tables>(table: K, value: Tables[K]): Tables[K] {
    this.db
      .prepare(
        'INSERT INTO records VALUES (?,?,?) ON CONFLICT(collection,id) DO UPDATE SET body=excluded.body',
      )
      .run(table, value.id, JSON.stringify(value));
    this.emit('change');
    return value;
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  event(type: string, data: unknown) {
    return this.put('events', {
      id: id(),
      at: new Date().toISOString(),
      type,
      data,
    });
  }
  close() {
    this.db.close();
  }
}
