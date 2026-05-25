/// <reference types="@cloudflare/workers-types" />

// Estende a interface Env do módulo "cloudflare:workers" (já declarado pelos
// tipos oficiais) com os bindings deste projeto.
declare module "cloudflare:workers" {
  interface Env {
    DB: D1Database;
    MEDIA: R2Bucket;
    APP_ENV: string;
    IG_APP_ID?: string;
    IG_APP_SECRET?: string;
    IG_REDIRECT_URI?: string;
    CRON_SECRET?: string;
  }
}

export {};
