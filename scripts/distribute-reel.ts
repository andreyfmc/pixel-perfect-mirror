#!/usr/bin/env bun
/**
 * Distribui um reel para várias contas IG, gerando uma variante única por conta.
 *
 * Para CADA conta:
 *   - strip total de metadados (-map_metadata -1 -map_chapters -1 -fflags +bitexact)
 *   - re-encode H.264 com CRF/bitrate determinístico (seed = account+source)
 *   - crop 1-2px aleatório + brilho ±1% + mirror opcional
 *   - áudio: atempo 1.005 + AAC 128k
 *   - upload para R2 via /api/media/upload
 *   - cria item na fila via /api/queue
 *
 * Uso:
 *   bun scripts/distribute-reel.ts \
 *     --file ./reel.mp4 \                  # OU --drive-id <fileId>
 *     --accounts atelier.noir,studio.lumen \
 *     --caption "novo drop" \
 *     --start "2026-05-26T20:00:00Z" \
 *     --gap 15                              # minutos entre contas
 *
 * Env:
 *   WORKER_URL              ex: https://insta-manager.andreyfmc.workers.dev
 *   LOVABLE_API_KEY         (só necessário se --drive-id)
 *   GOOGLE_DRIVE_API_KEY    (só necessário se --drive-id)
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------- args ----------------
const argv = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const FILE = arg("file");
const DRIVE_ID = arg("drive-id");
const ACCOUNTS = (arg("accounts") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const CAPTION = arg("caption") ?? "";
const START = arg("start") ?? new Date(Date.now() + 60_000).toISOString();
const GAP_MIN = Number(arg("gap") ?? 15);
const WORKER_URL = (process.env.WORKER_URL ?? arg("worker") ?? "").replace(/\/$/, "");

if (!WORKER_URL) die("Defina WORKER_URL ou passe --worker https://...");
if (!ACCOUNTS.length) die("--accounts é obrigatório (csv de account_id ou username)");
if (!FILE && !DRIVE_ID) die("Passe --file ./reel.mp4 ou --drive-id <id>");

// ---------------- helpers ----------------
function die(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
function log(msg: string) {
  console.log(`• ${msg}`);
}
function seededRng(seed: string): () => number {
  const h = createHash("sha256").update(seed).digest();
  let i = 0;
  return () => {
    const v = h.readUInt32BE(i % 28);
    i = (i + 4) % 28;
    return v / 0xffffffff;
  };
}

// ---------------- main ----------------
const workDir = join(tmpdir(), `distribute-${Date.now()}`);
await mkdir(workDir, { recursive: true });

// 1) source
let sourcePath: string;
if (FILE) {
  sourcePath = FILE;
  log(`Fonte local: ${sourcePath}`);
} else {
  sourcePath = join(workDir, "source.mp4");
  log(`Baixando do Drive id=${DRIVE_ID}...`);
  await downloadFromDrive(DRIVE_ID!, sourcePath);
}

// 2) resolve account IDs
log(`Carregando contas do worker...`);
const accountsRes = await fetch(`${WORKER_URL}/api/accounts`);
if (!accountsRes.ok) die(`GET /api/accounts falhou: ${accountsRes.status}`);
const { accounts } = (await accountsRes.json()) as {
  accounts: Array<{ id: string; username: string }>;
};
const resolved = ACCOUNTS.map((token) => {
  const acc = accounts.find((a) => a.id === token || a.username === token);
  if (!acc) die(`Conta não encontrada: ${token}`);
  return acc;
});

// 3) para cada conta: variante + upload + enqueue
const start = new Date(START).getTime();
for (let i = 0; i < resolved.length; i++) {
  const acc = resolved[i];
  const variantPath = join(workDir, `variant-${acc.id}.mp4`);
  const seed = `${acc.id}|${FILE ?? DRIVE_ID}`;
  log(`[${i + 1}/${resolved.length}] @${acc.username} → ffmpeg`);
  await renderVariant(sourcePath, variantPath, seed);

  log(`[${i + 1}/${resolved.length}] @${acc.username} → upload R2`);
  const key = await uploadToR2(variantPath, `reel-${acc.username}.mp4`);

  const scheduledAt = new Date(start + i * GAP_MIN * 60_000).toISOString();
  log(`[${i + 1}/${resolved.length}] @${acc.username} → enfileirar @ ${scheduledAt}`);
  await enqueue({
    account_id: acc.id,
    caption: CAPTION,
    media_type: "REEL",
    media_key: key,
    scheduled_at: scheduledAt,
  });
  await unlink(variantPath).catch(() => {});
}

log(`✓ Distribuído para ${resolved.length} conta(s).`);

// ---------------- impl ----------------
async function downloadFromDrive(id: string, dest: string) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY || !GOOGLE_DRIVE_API_KEY) {
    die("Para --drive-id preciso de LOVABLE_API_KEY + GOOGLE_DRIVE_API_KEY no env");
  }
  const res = await fetch(
    `https://connector-gateway.lovable.dev/google_drive/drive/v3/files/${id}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
      },
    },
  );
  if (!res.ok) die(`Drive download falhou: ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function renderVariant(input: string, output: string, seed: string) {
  const rnd = seededRng(seed);
  const crf = 23 + Math.floor(rnd() * 4); // 23-26
  const vbr = 2800 + Math.floor(rnd() * 600); // 2800-3400 kbps
  const cropX = 1 + Math.floor(rnd() * 2); // 1-2
  const cropY = 1 + Math.floor(rnd() * 2);
  const brightness = (rnd() * 0.02 - 0.01).toFixed(4); // -0.01..+0.01
  const mirror = rnd() > 0.5;
  const vfilters = [
    `crop=iw-${cropX * 2}:ih-${cropY * 2}:${cropX}:${cropY}`,
    `eq=brightness=${brightness}`,
    mirror ? "hflip" : null,
  ]
    .filter(Boolean)
    .join(",");

  const args = [
    "-y",
    "-i", input,
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    "-fflags", "+bitexact",
    "-vf", vfilters,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", String(crf),
    "-b:v", `${vbr}k`,
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-af", "atempo=1.005",
    "-movflags", "+faststart",
    output,
  ];
  const r = spawnSync("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) die(`ffmpeg falhou (status ${r.status}). Está instalado?`);
}

async function uploadToR2(path: string, filename: string): Promise<string> {
  const buf = await readFile(path);
  const res = await fetch(`${WORKER_URL}/api/media/upload`, {
    method: "POST",
    headers: {
      "content-type": "video/mp4",
      "x-filename": filename,
    },
    body: buf,
  });
  if (!res.ok) die(`Upload R2 falhou: ${res.status} ${await res.text()}`);
  const { key } = (await res.json()) as { key: string };
  return key;
}

async function enqueue(body: Record<string, unknown>) {
  const res = await fetch(`${WORKER_URL}/api/queue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) die(`Enqueue falhou: ${res.status} ${await res.text()}`);
}
