-- Snapshots diários de seguidores por conta.
CREATE TABLE IF NOT EXISTS followers_snapshots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  followers INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_followers_snap_account_date
  ON followers_snapshots(account_id, snapshot_date DESC);
