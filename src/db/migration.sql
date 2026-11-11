PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS records (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  body TEXT NOT NULL CHECK(json_valid(body)),
  PRIMARY KEY(collection, id)
);
CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO migrations VALUES (1);
CREATE UNIQUE INDEX IF NOT EXISTS message_dedupe ON records(
  json_extract(body, '$.projectId'), json_extract(body, '$.sender'), json_extract(body, '$.dedupeKey')
) WHERE collection = 'messages';
