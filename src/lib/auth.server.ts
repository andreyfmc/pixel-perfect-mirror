// Single-user auth: HS256 JWT em cookie httpOnly + bcrypt para senha.
// Credenciais em variáveis de ambiente (ADMIN_EMAIL / ADMIN_PASSWORD_HASH / JWT_SECRET).
import bcrypt from "bcryptjs";
import { env } from "./cf.server";

export const COOKIE_NAME = "im_session";
export const COOKIE_MAX_AGE = 60 * 60 * 24; // 24h

// ---------- base64url ----------
function b64urlEncode(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else bytes = new Uint8Array(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecodeToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- JWT HS256 ----------
async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const data = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(payload))}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${b64urlEncode(sig)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  try {
    const key = await hmacKey(secret);
    const sigBytes = b64urlDecodeToBytes(s);
    const sigBuf = new ArrayBuffer(sigBytes.byteLength);
    new Uint8Array(sigBuf).set(sigBytes);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBuf,
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecodeToBytes(p))) as {
      exp?: number;
    } & Record<string, unknown>;
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- cookies ----------
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}

export function sessionCookie(token: string, maxAge = COOKIE_MAX_AGE): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// ---------- senha ----------
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

// ---------- env helpers ----------
export function getAuthEnv() {
  const e = env as Record<string, string | undefined>;
  return {
    email: (e.ADMIN_EMAIL ?? "").trim().toLowerCase(),
    hash: e.ADMIN_PASSWORD_HASH ?? "",
    secret: e.JWT_SECRET ?? "",
  };
}

export async function isRequestAuthenticated(request: Request): Promise<boolean> {
  const { secret } = getAuthEnv();
  if (!secret) return false;
  const cookies = parseCookies(request.headers.get("cookie"));
  const tok = cookies[COOKIE_NAME];
  if (!tok) return false;
  const payload = await verifyJwt(tok, secret);
  return !!payload;
}

// ---------- rate limit em memória (por isolate) ----------
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function rateLimitCheck(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, b);
  }
  if (b.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}
export function rateLimitConsume(ip: string) {
  const b = buckets.get(ip);
  if (b) b.count += 1;
}
export function rateLimitReset(ip: string) {
  buckets.delete(ip);
}
