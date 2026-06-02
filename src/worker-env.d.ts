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
      // Meta / Facebook Login (para contas que precisam de Página)
      META_APP_ID?: string;
      META_APP_SECRET?: string;
      // Instagram Login direto (Business sem Página)
      META_IG_APP_ID?: string;
      META_IG_APP_SECRET?: string;
      // Override opcional do origin público (caso o Worker rode atrás de proxy)
      PUBLIC_BASE_URL?: string;
      // Lovable connector gateway
      LOVABLE_API_KEY?: string;
      GOOGLE_DRIVE_API_KEY?: string;
    }
  }
}

export {};
