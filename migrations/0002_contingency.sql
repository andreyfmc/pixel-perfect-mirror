-- Contingência: estoque de contas backup com credenciais manuais (login + senha + 2FA secret)
CREATE TABLE IF NOT EXISTS contingency (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password TEXT NOT NULL DEFAULT '',
  totp_secret TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'em_edicao'
    CHECK (status IN ('em_edicao','pronta','em_uso','descartada')),
  quality TEXT NOT NULL DEFAULT 'boa'
    CHECK (quality IN ('boa','media','ruim')),
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contingency_status ON contingency(status);
CREATE INDEX IF NOT EXISTS idx_contingency_username ON contingency(username);
