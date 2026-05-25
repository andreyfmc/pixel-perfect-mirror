/// <reference path="../worker-env.d.ts" />
// Acesso aos bindings do Cloudflare Worker (D1, R2, vars, secrets).
// Server-only — o sufixo .server.ts impede inclusão no bundle do cliente.

import { env as cfEnv } from "cloudflare:workers";

export const env = cfEnv;

/** True quando o binding D1 está realmente disponível (deploy real na Cloudflare). */
export function hasDb(): boolean {
  try {
    return Boolean(cfEnv?.DB);
  } catch {
    return false;
  }
}

/** True quando o binding R2 está disponível. */
export function hasMedia(): boolean {
  try {
    return Boolean(cfEnv?.MEDIA);
  } catch {
    return false;
  }
}

export function requireDb(): D1Database {
  if (!hasDb()) {
    throw new Error(
      "D1 binding 'DB' indisponível. Rode `wrangler d1 create insta-manager`, " +
        "atualize wrangler.jsonc com o ID e faça `wrangler deploy`.",
    );
  }
  return cfEnv.DB;
}

export function requireMedia(): R2Bucket {
  if (!hasMedia()) {
    throw new Error("R2 binding 'MEDIA' indisponível. Veja SETUP.md.");
  }
  return cfEnv.MEDIA;
}
