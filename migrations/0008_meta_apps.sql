-- Multi-App Meta: suporte a múltiplos apps com rotação automática de contas.
-- Aplicar: wrangler d1 migrations apply insta-manager --remote

CREATE TABLE IF NOT EXISTS meta_apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'facebook'
    CHECK (provider IN ('facebook', 'instagram')),
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_meta_apps_active ON meta_apps(is_active);

-- Adiciona coluna meta_app_id em accounts
ALTER TABLE accounts ADD COLUMN meta_app_id TEXT REFERENCES meta_apps(id);

-- Adiciona coluna meta_app_id em oauth_states para rastrear qual app
-- foi usado em cada fluxo de autorização
ALTER TABLE oauth_states ADD COLUMN meta_app_id TEXT REFERENCES meta_apps(id);
