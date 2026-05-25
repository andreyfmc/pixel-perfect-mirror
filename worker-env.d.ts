/// <reference types="@cloudflare/workers-types" />

// Tipagem dos bindings declarados em wrangler.jsonc.
// O módulo virtual "cloudflare:workers" é fornecido pelo @cloudflare/vite-plugin
// e expõe `env` tipado durante a execução do Worker.
declare module "cloudflare:workers" {
  export interface Env {
    DB: D1Database;
    MEDIA: R2Bucket;
    APP_ENV: string;
    // Secrets — registrados via `wrangler secret put`
    IG_APP_ID?: string;
    IG_APP_SECRET?: string;
    IG_REDIRECT_URI?: string;
    CRON_SECRET?: string;
  }
  export const env: Env;
}
