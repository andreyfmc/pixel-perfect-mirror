-- Loops contínuos: agendamentos recorrentes que se auto-materializam ciclo a ciclo.
-- source_type:
--   'snapshot'    → usa a lista de video_ids_json (fixa no momento da criação)
--   'live_folder' → relê a pasta folder_id no Drive antes de cada ciclo
-- order_mode: 'sequential' | 'random'
-- status:     'active' | 'paused' | 'stopped'

CREATE TABLE IF NOT EXISTS loops (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('snapshot','live_folder')),
  folder_id TEXT,                        -- usado em live_folder; opcional em snapshot
  folder_name TEXT,                      -- nome da pasta (cache para UI)
  video_ids_json TEXT,                   -- JSON array de IDs do Drive (snapshot)
  account_ids_json TEXT NOT NULL,        -- JSON array de account.id
  caption TEXT NOT NULL DEFAULT '',
  gap_min INTEGER NOT NULL DEFAULT 60,
  jitter_min INTEGER NOT NULL DEFAULT 20,
  order_mode TEXT NOT NULL DEFAULT 'random' CHECK (order_mode IN ('sequential','random')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','stopped')),
  cycle_number INTEGER NOT NULL DEFAULT 0,
  next_cycle_at TEXT NOT NULL,           -- ISO UTC — quando começa o próximo ciclo
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loops_active ON loops(status, next_cycle_at);

-- Vincula itens da fila ao loop que os gerou
ALTER TABLE queue ADD COLUMN loop_id TEXT;
ALTER TABLE queue ADD COLUMN cycle_number INTEGER;
