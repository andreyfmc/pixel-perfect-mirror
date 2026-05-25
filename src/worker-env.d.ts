/// <reference types="@cloudflare/workers-types" />

// O `env` exportado por "cloudflare:workers" tem tipo Cloudflare.Env.
// Estendemos esse namespace global para tipar nossos bindings.
declare global {
  namespace Cloudflare {
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
}

export {};
