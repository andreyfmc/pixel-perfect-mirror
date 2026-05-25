# Setup — Cloudflare (D1 + R2 + Cron + Instagram)

Tudo abaixo é feito **uma única vez**, na sua máquina, com sua conta Cloudflare. Depois é só `wrangler deploy` quando quiser publicar mudanças.

## 0) Pré-requisitos
- Conta Cloudflare (free serve)
- Conta **Instagram Business ou Creator** vinculada a uma Página do Facebook
- Um **App** no [developers.facebook.com](https://developers.facebook.com) com produto **Instagram Graph API** habilitado

## 1) Instalar wrangler e logar
```bash
bun add -d wrangler
bunx wrangler login
```

## 2) Criar D1, R2 e aplicar migration
```bash
# D1 — copie o "database_id" devolvido e cole em wrangler.jsonc
bunx wrangler d1 create insta-manager

# R2 — bucket de mídias
bunx wrangler r2 bucket create insta-media

# Migration (cria tabelas + seed dos mocks)
bunx wrangler d1 migrations apply insta-manager --remote
```

Depois disso edite `wrangler.jsonc`:
```jsonc
"database_id": "COLE_O_ID_AQUI"
```

## 3) Expor o R2 com domínio público
A Graph API exige `image_url` / `video_url` **públicos**. Duas opções:

- **Fácil**: ative *Public Access* no bucket (Cloudflare dashboard → R2 → `insta-media` → Settings → Public Access). Pega uma URL `https://pub-XXXX.r2.dev` e cole em `src/lib/scheduler.server.ts` no lugar de `pub-placeholder.r2.dev`.
- **Profissional**: conecte um custom domain (`media.seusite.com`) e atualize a mesma constante.

## 4) Secrets (Instagram Graph + cron)
```bash
bunx wrangler secret put IG_APP_ID
bunx wrangler secret put IG_APP_SECRET
bunx wrangler secret put IG_REDIRECT_URI    # ex: https://insta-manager.SEU.workers.dev/api/instagram/callback
bunx wrangler secret put CRON_SECRET         # qualquer string longa — protege /api/cron/tick
```

## 5) Conectar uma conta IG (manual, primeira vez)
Não há tela de OAuth ainda — você gera o **long-lived token** uma vez no Graph API Explorer e insere via D1:
```bash
bunx wrangler d1 execute insta-manager --remote --command "
UPDATE accounts
SET ig_user_id = '178414XXXXXXXX',
    access_token = 'IGQVJ...long_lived_token...',
    token_expires_at = '2026-09-01T00:00:00Z'
WHERE username = 'atelier.noir';
"
```

> Para automatizar o OAuth depois, criamos `/api/instagram/callback` — me chama.

## 6) Deploy
```bash
bunx wrangler deploy
```
O app sobe em `https://insta-manager.SEU-SUBDOMINIO.workers.dev`. As rotas `/api/*` agora batem em D1/R2 reais e o **cron roda sozinho a cada minuto** publicando o que estiver vencido na fila.

## 7) Dev local com bindings reais
```bash
bunx wrangler dev --remote
```
Usa D1/R2 da nuvem em vez de stubs locais.

## 8) Testar o scheduler manualmente
```bash
curl -X POST -H "x-cron-secret: SEU_SECRET" \
  https://insta-manager.SEU.workers.dev/api/cron/tick
```

---

## Comportamento sem deploy
No **preview do Lovable** os bindings D1/R2 não existem. As rotas `/api/*` retornam erro e o front cai automaticamente nos mocks de `src/lib/mock.ts` (graças ao fallback em `src/lib/api-client.ts`). A UI continua navegável para você iterar visual.

## Custos esperados (free tier)
| Serviço | Limite grátis | Uso esperado |
|---|---|---|
| Workers requests | 100k/dia | < 1k/dia |
| D1 leituras | 5M/dia | < 10k/dia |
| R2 armazenamento | 10 GB | depende das mídias |
| R2 egress | **ilimitado grátis** | — |
| Cron triggers | ilimitado | 1440/dia (1/min) |

Ou seja: **zero custo** em uso normal.
