# scripts/

Ferramentas locais que rodam no SEU computador (não no Worker).

## `distribute-reel.ts` — reel único por conta

Pega um vídeo (do seu PC ou do Google Drive), gera uma variante única por
conta IG (metadados zerados + re-encode + micro-ajustes visuais) e enfileira
para publicação.

### Pré-requisitos

```bash
# ffmpeg (macOS)
brew install ffmpeg
# ou Linux: apt install ffmpeg / pacman -S ffmpeg

# bun já está no projeto
bun --version
```

### Env

Crie `.env.local` na raiz (ou exporte na sessão):

```bash
WORKER_URL=https://insta-manager.andreyfmc.workers.dev

# Só se for usar --drive-id:
LOVABLE_API_KEY=lov_...
GOOGLE_DRIVE_API_KEY=...
```

`LOVABLE_API_KEY` e `GOOGLE_DRIVE_API_KEY` aparecem nos secrets do projeto
(Lovable → Cloud → Secrets) depois que você conecta o Google Drive.

### Uso com arquivo local

```bash
bun scripts/distribute-reel.ts \
  --file ./meus-reels/drop1.mp4 \
  --accounts atelier.noir,studio.lumen,maison.veil \
  --caption "novo drop ✦" \
  --start "2026-05-26T20:00:00Z" \
  --gap 15
```

### Uso com Google Drive

```bash
bun scripts/distribute-reel.ts \
  --drive-id 1AbCdEf... \
  --accounts atelier.noir,studio.lumen \
  --caption "novo drop"
```

Como pegar o `--drive-id`: na URL do arquivo no Drive,
`https://drive.google.com/file/d/<ID>/view` — copie o `<ID>`.

### O que cada variante recebe

Cada conta tem um `seed = sha256(account_id + fonte)`, garantindo:

- **CRF**: 23-26 (qualidade)
- **Bitrate**: 2800-3400 kbps
- **Crop**: 1-2 px de cada borda
- **Brilho**: ±1%
- **Mirror horizontal**: 50% das contas
- **Áudio**: re-encode AAC 128k + `atempo=1.005` (impercept.)
- **Metadados**: zerados (`-map_metadata -1 -map_chapters -1 -fflags +bitexact`)

Re-rodar com a mesma conta + mesma fonte dá EXATAMENTE a mesma variante
(reprodutível). Mudar `account_id` ou fonte gera nova variante.

### Output

Cada conta vira:

1. Um arquivo `media/AAAA/MM/uuid-reel-{username}.mp4` no R2.
2. Um item em `queue` agendado para `start + i*gap`.

O cron do Worker publica automaticamente quando chega a hora.
