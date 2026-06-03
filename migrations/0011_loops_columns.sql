-- Sincroniza schema da tabela `loops` com o código.
-- As colunas media_type e videos_per_cycle eram criadas apenas via ALTER TABLE
-- no boot (db.server.ts ensureSchema). Quem aplica migrations diretamente sem
-- subir o app ficava com a tabela incompleta e todos os INSERTs falhavam.
-- SQLite não suporta IF NOT EXISTS em ADD COLUMN; envolvemos em transação e
-- ignoramos o erro de "duplicate column" no runtime (D1 trata como no-op no
-- segundo apply). Se sua ferramenta de migração for estrita, rode apenas uma
-- vez por banco.

ALTER TABLE loops ADD COLUMN media_type TEXT NOT NULL DEFAULT 'REEL';
ALTER TABLE loops ADD COLUMN videos_per_cycle INTEGER NOT NULL DEFAULT 1;
