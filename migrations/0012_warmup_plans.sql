-- Planos de aquecimento: postagem em lotes com fases configuráveis.
-- Cada plano tem N fases (JSON). Cada fase define:
--   postsPerBatch  → quantos vídeos por lote
--   pauseHours     → horas de pausa entre lotes
--   totalPosts     → total de posts para completar a fase (0 = ilimitado)
--
-- O scheduler processa um lote quando batch_due_at <= now() e status = 'active'.
-- Ao atingir posts_done_in_phase >= fase.totalPosts, avança para a próxima fase
-- (se auto_advance = 1) ou pausa esperando avanço manual.

CREATE TABLE IF NOT EXISTS warmup_plans (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,

  -- JSON array de { postsPerBatch, pauseHours, totalPosts, label? }
  phases_json   TEXT NOT NULL DEFAULT '[]',

  -- Fase atual (índice 0-based)
  current_phase INTEGER NOT NULL DEFAULT 0,

  -- Posts feitos na fase atual
  posts_done_in_phase INTEGER NOT NULL DEFAULT 0,

  -- Total de posts feitos no plano inteiro
  posts_done_total INTEGER NOT NULL DEFAULT 0,

  -- Contas selecionadas para este plano (JSON array de account.id)
  account_ids_json TEXT NOT NULL DEFAULT '[]',

  -- Fonte de mídia (mesma estrutura dos loops)
  source_type   TEXT NOT NULL DEFAULT 'live_folder' CHECK (source_type IN ('snapshot','live_folder')),
  folder_id     TEXT,
  folder_name   TEXT,
  video_ids_json TEXT,

  caption       TEXT NOT NULL DEFAULT '',
  order_mode    TEXT NOT NULL DEFAULT 'random' CHECK (order_mode IN ('sequential','random')),

  -- Avanço automático de fase ao atingir totalPosts
  auto_advance  INTEGER NOT NULL DEFAULT 0,

  -- Status do plano
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','waiting_phase','finished','stopped')),

  -- Quando o próximo lote deve ser publicado
  batch_due_at  TEXT NOT NULL DEFAULT (datetime('now')),

  -- Índice do próximo vídeo na ordem sequential
  video_cursor  INTEGER NOT NULL DEFAULT 0,

  last_error    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_warmup_active ON warmup_plans(status, batch_due_at);

-- Registro de cada lote publicado (para histórico/diagnóstico)
CREATE TABLE IF NOT EXISTS warmup_batches (
  id            TEXT PRIMARY KEY,
  plan_id       TEXT NOT NULL REFERENCES warmup_plans(id) ON DELETE CASCADE,
  phase_index   INTEGER NOT NULL,
  accounts_json TEXT NOT NULL,   -- quais contas foram usadas
  media_keys_json TEXT NOT NULL, -- quais media_keys foram enfileiradas
  enqueued_at   TEXT NOT NULL DEFAULT (datetime('now')),
  posts_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_warmup_batches_plan ON warmup_batches(plan_id, enqueued_at);
