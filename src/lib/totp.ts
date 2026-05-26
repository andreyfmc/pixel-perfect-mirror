// TOTP (RFC 6238) gerador no browser usando Web Crypto.
// Suporta segredos em base32 (formato padrão do Instagram/Google Authenticator).

function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/\s+/g, "").replace(/=+$/, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

export async function generateTOTP(
  secret: string,
  opts: { period?: number; digits?: number; timestamp?: number } = {},
): Promise<string> {
  if (!secret) return "------";
  const period = opts.period ?? 30;
  const digits = opts.digits ?? 6;
  const ts = opts.timestamp ?? Date.now();
  const counter = Math.floor(ts / 1000 / period);

  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);

  let keyBuf: ArrayBuffer;
  try {
    const bytes = base32Decode(secret);
    if (bytes.length === 0) return "------";
    keyBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  } catch {
    return "------";
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
  const offset = sig[sig.length - 1] & 0x0f;
  const code =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  const str = (code % 10 ** digits).toString().padStart(digits, "0");
  return str;
}

export function totpSecondsRemaining(period = 30, timestamp = Date.now()): number {
  return period - Math.floor(timestamp / 1000) % period;
}
