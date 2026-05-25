/// <reference path="../worker-env.d.ts" />
// Acesso aos bindings do Cloudflare Worker (D1, R2, vars, secrets).
// Server-only — o sufixo .server.ts impede inclusão no bundle do cliente.
//
// O módulo virtual "cloudflare:workers" só existe no build do Worker (via
// @cloudflare/vite-plugin). No dev/SSR do Lovable preview ele não resolve,
// então carregamos via import dinâmico protegido e expomos um env vazio.

type CFEnv = Partial<Cloudflare.Env>;

let cached: CFEnv | undefined;

async function loadEnv(): Promise<CFEnv> {
  if (cached) return cached;
  try {
    const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as {
      env?: CFEnv;
    };
    cached = mod.env ?? {};
  } catch {
    cached = {};
  }
  return cached;
}

// Snapshot síncrono — preenchido na primeira chamada async. Antes disso
// retorna {} e os has*/require* respondem coerentemente.
let snapshot: CFEnv = {};
void loadEnv().then((e) => {
  snapshot = e;
});

export const env: CFEnv = new Proxy({} as CFEnv, {
  get(_t, prop: string) {
    return (snapshot as Record<string, unknown>)[prop];
  },
});

export function hasDb(): boolean {
  return Boolean(snapshot.DB);
}

export function hasMedia(): boolean {
  return Boolean(snapshot.MEDIA);
}

export function requireDb(): D1Database {
  if (!snapshot.DB) {
    throw new Error(
      "D1 binding 'DB' indisponível. Rode `wrangler d1 create insta-manager`, " +
        "atualize wrangler.jsonc com o ID e faça `wrangler deploy`.",
    );
  }
  return snapshot.DB;
}

export function requireMedia(): R2Bucket {
  if (!snapshot.MEDIA) {
    throw new Error("R2 binding 'MEDIA' indisponível. Veja SETUP.md.");
  }
  return snapshot.MEDIA;
}
