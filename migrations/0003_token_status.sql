-- Estado explícito do token OAuth para bloquear publicações sem retry automático.
ALTER TABLE accounts ADD COLUMN token_status TEXT NOT NULL DEFAULT 'valid' CHECK (token_status IN ('valid','expired'));

UPDATE accounts
SET token_status = CASE
  WHEN access_token IS NULL THEN 'expired'
  WHEN token_expires_at IS NOT NULL AND datetime(token_expires_at) <= datetime('now') THEN 'expired'
  ELSE 'valid'
END;
