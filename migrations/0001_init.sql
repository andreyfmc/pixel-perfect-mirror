-- Insta Manager — schema inicial (D1 / SQLite)
-- Aplicar: wrangler d1 migrations apply insta-manager --remote

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  profile_picture TEXT,
  ig_user_id TEXT,                       -- ID na Graph API
  access_token TEXT,                     -- token de longa duração (criptografar idealmente)
  token_expires_at TEXT,                 -- ISO8601
  token_status TEXT NOT NULL DEFAULT 'valid'
    CHECK (token_status IN ('valid','expired')),
  followers INTEGER DEFAULT 0,
  health_score INTEGER DEFAULT 100,      -- 0..100
  last_post_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS queue (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  caption TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL CHECK (media_type IN ('REEL','IMAGE','STORY','CAROUSEL')),
  media_key TEXT NOT NULL,               -- chave no R2 (ex: media/2026/05/uuid.mp4)
  thumb_key TEXT,                        -- chave do thumbnail no R2
  scheduled_at TEXT NOT NULL,            -- ISO8601 UTC
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','processing','published','failed','canceled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  ig_container_id TEXT,                  -- container retornado pela Graph API
  ig_media_id TEXT,                      -- id final após publish
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_queue_due ON queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_queue_account ON queue(account_id);

CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  queue_id TEXT,                         -- referência opcional ao item original
  ig_media_id TEXT NOT NULL,
  caption TEXT,
  media_type TEXT,
  permalink TEXT,
  thumb_url TEXT,
  published_at TEXT NOT NULL,
  reach INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  fetched_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_history_account ON history(account_id, published_at DESC);

-- ============================================================
-- SEED — mocks de desenvolvimento
-- ============================================================
INSERT OR IGNORE INTO accounts (id, username, name, profile_picture, health_score, followers, last_post_at, token_expires_at, token_status) VALUES
  ('1','atelier.noir','Atelier Noir','https://api.dicebear.com/9.x/glass/svg?seed=atelier',92,18420,'2026-05-24T18:30:00Z','2026-07-12T00:00:00Z','valid'),
  ('2','neon.diary','Neon Diary','https://api.dicebear.com/9.x/glass/svg?seed=neon',74,6320,'2026-05-23T09:12:00Z','2026-06-02T00:00:00Z','valid'),
  ('3','kombu.studio','Kombu Studio','https://api.dicebear.com/9.x/glass/svg?seed=kombu',58,2104,'2026-05-20T22:00:00Z','2026-05-30T00:00:00Z','valid'),
  ('4','lume.cafe','Lume Café','https://api.dicebear.com/9.x/glass/svg?seed=lume',88,9870,'2026-05-25T07:45:00Z','2026-08-01T00:00:00Z','valid');

INSERT OR IGNORE INTO queue (id, account_id, caption, media_type, media_key, thumb_key, scheduled_at, status) VALUES
  ('q1','1','Drop 03 — bastidores do shoot ✦','REEL','seed/q1.mp4','seed/q1.jpg','2026-05-25T19:00:00Z','scheduled'),
  ('q2','2','Sexta-feira, cidade acordando 🌃','IMAGE','seed/q2.jpg','seed/q2.jpg','2026-05-25T21:30:00Z','scheduled'),
  ('q3','4','Novo grão da semana — Etiópia Yirgacheffe','STORY','seed/q3.jpg','seed/q3.jpg','2026-05-26T07:00:00Z','processing'),
  ('q4','3','Workshop de cerâmica — últimas vagas','REEL','seed/q4.mp4','seed/q4.jpg','2026-05-26T12:00:00Z','failed');

INSERT OR IGNORE INTO history (id, account_id, ig_media_id, caption, media_type, thumb_url, published_at, reach, likes, comments) VALUES
  ('h1','1','ig_seed_h1','Editorial primavera','IMAGE','https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400','2026-05-24T18:30:00Z',12400,980,42),
  ('h2','4','ig_seed_h2','Latte art — domingo lento','IMAGE','https://images.unsplash.com/photo-1511920170033-f8396924c348?w=400','2026-05-24T09:00:00Z',4200,312,18),
  ('h3','2','ig_seed_h3','POV: 23h, Vila Madalena','REEL','https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400','2026-05-23T09:12:00Z',8800,740,56);
