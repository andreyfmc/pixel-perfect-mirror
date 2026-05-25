/// <reference path="../worker-env.d.ts" />
// Acesso aos bindings do Cloudflare Worker (D1, R2, vars, secrets).
// Server-only — o sufixo .server.ts impede inclusão no bundle do cliente.
//
// IMPORTANTE: no Cloudflare Workers, o `env` exportado por "cloudflare:workers"
// é resolvido por requisição (AsyncLocalStorage). Não pode ser snapshotado
// na inicialização do módulo — é preciso ler a cada acesso, dentro do
// contexto de uma request.

type CFEnv = Partial<Cloudflare.Env>;

let mod: { env?: CFEnv } | undefined;
let importPromise: Promise<void> | undefined;

function tryLoadSync() {
  if (mod || importPromise) return;
  importPromise = import(/* @vite-ignore */ "cloudflare:workers")
    .then((m) => {
      mod = m as { env?: CFEnv };
    })
    .catch(() => {
      mod = { env: {} };
    });
}

function currentEnv(): CFEnv {
  tryLoadSync();
  return mod?.env ?? {};
}

export const env: CFEnv = new Proxy({} as CFEnv, {
  get(_t, prop: string) {
    return (currentEnv() as Record<string, unknown>)[prop];
  },
  has(_t, prop: string) {
    return prop in (currentEnv() as Record<string, unknown>);
  },
  ownKeys() {
    return Reflect.ownKeys(currentEnv() as Record<string, unknown>);
  },
  getOwnPropertyDescriptor(_t, prop: string) {
    return Reflect.getOwnPropertyDescriptor(currentEnv() as Record<string, unknown>, prop);
  },
});

// Garante que o módulo virtual seja resolvido antes do primeiro acesso.
// Em Workers, basta uma chamada async dentro de uma request para o env aparecer.
export async function ensureEnv(): Promise<CFEnv> {
  tryLoadSync();
  if (importPromise) await importPromise;
  return mod?.env ?? {};
}

export function hasDb(): boolean {
  return Boolean(currentEnv().DB);
}

export function hasMedia(): boolean {
  return Boolean(currentEnv().MEDIA);
}

export function requireDb(): D1Database {
  const e = currentEnv();
  if (!e.DB) {
    throw new Error(
      "D1 binding 'DB' indisponível. Rode `wrangler d1 create insta-manager`, " +
        "atualize wrangler.jsonc com o ID e faça `wrangler deploy`.",
    );
  }
  return e.DB;
}

export function requireMedia(): R2Bucket {
  const e = currentEnv();
  if (!e.MEDIA) {
    throw new Error("R2 binding 'MEDIA' indisponível. Veja SETUP.md.");
  }
  return e.MEDIA;
}
