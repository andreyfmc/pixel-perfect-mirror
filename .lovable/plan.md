# Reels únicos por conta — Drive + ffmpeg local + fila

## Arquitetura

```text
Google Drive (sua conta)
       │  (App Connector via gateway)
       ▼
scripts/distribute-reel.ts   ← roda no SEU PC com bun
       │
       ├─ baixa o arquivo fonte do Drive
       ├─ para CADA conta selecionada:
       │     ffmpeg: -map_metadata -1
       │            + CRF/bitrate aleatório (23-26 / 2.8-3.4 Mbps)
       │            + crop 1-2px aleatório + eq=brightness=±0.01
       │            + (opcional) hflip
       │            + atempo=1.005 no áudio
       │     → variant-{accountId}.mp4 em /tmp
       ├─ POST /api/media/upload para cada variante (R2)
       └─ POST /api/queue criando 1 item agendado por conta
```

Tudo roda local — Worker continua intocado (ffmpeg não roda em Cloudflare).

## O que vou construir

### 1. Conectar Google Drive
- Chamar `standard_connectors--connect` com `google_drive`.
- Adicionar helper `src/lib/drive.server.ts` que lista arquivos do Drive via gateway (`/google_drive/drive/v3/files?q=mimeType contains 'video/'`).
- Server function `listDriveVideos` + `getDriveDownloadUrl` (server-side, usa `LOVABLE_API_KEY` + `GOOGLE_DRIVE_API_KEY`).

### 2. Página Warmup — aba "Distribuir"
- Lista vídeos do Drive (thumb + nome + duração).
- Multi-select de contas IG (vem de `/api/accounts`).
- Campo: caption base, data/hora de agendamento, intervalo entre contas (ex: 15 min).
- Botão **"Gerar comando CLI"** → mostra um snippet pronto:
  ```bash
  bun scripts/distribute-reel.ts \
    --drive-id 1AbC... \
    --accounts atelier.noir,studio.lumen \
    --caption "novo drop" \
    --start "2026-05-26T20:00" \
    --gap 15
  ```
- (A página NÃO processa — só monta o comando, porque ffmpeg é local.)

### 3. CLI `scripts/distribute-reel.ts`
- Lê `WORKER_URL` e `CRON_SECRET` de `.env.local` (ou argv).
- Baixa o arquivo do Drive usando o **mesmo gateway** (Authorization: Bearer LOVABLE_API_KEY + X-Connection-Api-Key).
- Para cada conta gera uma variante com `ffmpeg` (params aleatórios por seed=accountId).
- Sobe cada variante via `POST /api/media/upload`.
- Cria item na fila via `POST /api/queue` (novo endpoint — hoje só temos GET).

### 4. Novo endpoint `POST /api/queue`
- `src/routes/api/queue.ts` ganha handler POST: valida com Zod (`accountId`, `mediaKey`, `caption`, `scheduledAt`, `mediaType`), insere em `queue_items`.

### 5. README curto em `scripts/README.md`
- Pré-requisitos: `ffmpeg` instalado, `bun`, `LOVABLE_API_KEY` no env.
- Exemplo end-to-end.

## Detalhes técnicos

- **Seed determinística por conta**: `hash(accountId + driveFileId)` decide CRF, bitrate, crop offset, brilho, mirror — assim re-rodar dá mesma variante (reprodutível).
- **Strip metadata**: `-map_metadata -1 -map_chapters -1 -fflags +bitexact`.
- **Vídeo**: `-c:v libx264 -crf {23..26} -b:v {2800..3400}k -vf "crop=iw-2:ih-2:1:1,eq=brightness=0.0X[,hflip]"`.
- **Áudio**: `-c:a aac -b:a 128k -af "atempo=1.005"`.
- **Drive download**: gateway aceita `?alt=media` — stream direto para `/tmp/source.mp4`.

## Fora do escopo desta iteração
- Drive picker visual com preview/scrub (lista simples basta).
- Processar no Worker (descartado — ffmpeg.wasm é lento e limitado).
- OAuth por usuário final (você é o único operador).

## Pergunta antes de codar
Tudo certo com essa estrutura, ou quer que o CLI também aceite arquivo local (`--file ./reel.mp4`) além de `--drive-id`?
