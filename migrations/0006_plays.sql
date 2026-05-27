-- plays = total de reproduções do reel (número visível no perfil).
-- reach = pessoas únicas que viram (métrica diferente, pode ser menor que plays).
ALTER TABLE history ADD COLUMN plays INTEGER DEFAULT 0;

-- Backfill: usa reach como fallback nas linhas existentes.
UPDATE history SET plays = reach WHERE (plays IS NULL OR plays = 0) AND reach > 0;

-- Snapshots diários por reel — permite medir crescimento dia a dia.
CREATE TABLE IF NOT EXISTS history_snapshots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  ig_media_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,        -- 'YYYY-MM-DD' (UTC)
  plays INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ig_media_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_account_date
  ON history_snapshots(account_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_media
  ON history_snapshots(ig_media_id, snapshot_date DESC);
