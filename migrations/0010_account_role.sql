-- Persiste o role da conta no banco (antes era só localStorage).
-- Valores: 'active' | 'reserve' | 'discarded'
ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'active'
  CHECK (role IN ('active', 'reserve', 'discarded'));

CREATE INDEX IF NOT EXISTS idx_accounts_role ON accounts(role);
