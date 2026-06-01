-- Parte 9: auditoria de qual app Meta foi usado em cada publicação.
-- Aplicar: wrangler d1 migrations apply insta-manager --remote

-- Coluna na fila: registra o app_id usado no momento da publicação
ALTER TABLE queue ADD COLUMN app_used_at_publish TEXT;

-- Coluna no histórico: nome legível do app (desnormalizado para leitura fácil)
ALTER TABLE history ADD COLUMN meta_app_name TEXT;
