-- States únicos para o fluxo OAuth de conexão por link.
-- Cada state é gerado quando o operador pede um link e marcado como consumed
-- após o callback bem-sucedido (ou após expirar).
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','consumed','expired')),
  redirect_uri TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_status ON oauth_states(status);
