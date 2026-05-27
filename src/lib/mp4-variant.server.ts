// Serverless MP4 binary variator.
//
// Para cada conta, modifica o arquivo MP4 no nível dos átomos (boxes ISO/IEC 14496-12)
// sem recodificar, criando um arquivo binariamente único mas visualmente idêntico:
//
//   1. uuid box no FIM do arquivo com payload determinístico (accountId+driveFileId)
//      → Não muda offsets existentes; players ignoram boxes uuid desconhecidos.
//   2. mvhd/mdhd/tkhd: rotaciona creation_time/modification_time entre 2022-2024.
//   3. smhd (audio): altera o balance em ±0.5% (imperceptível).
//   4. ©too / ©enc em moov.udta.meta.ilst: sobrescreve encoder string (mesmo tamanho).
//
// Importante: nenhuma transformação aqui altera o tamanho de qualquer box existente,
// então stco/co64 (chunk offsets) NÃO precisam ser recalculados. Apenas o uuid
// novo é appended no fim do arquivo.
//
// Roda 100% em memória, sem dependências nativas. Adequado para Cloudflare Workers
// até ~80MB de input (limite de memória 128MB).

const td = new TextDecoder("ascii");
const te = new TextEncoder();

function u32(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) >>> 0) +
    (buf[off + 1] << 16) +
    (buf[off + 2] << 8) +
    buf[off + 3]
  );
}
function writeU32(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >>> 24) & 0xff;
  buf[off + 1] = (val >>> 16) & 0xff;
  buf[off + 2] = (val >>> 8) & 0xff;
  buf[off + 3] = val & 0xff;
}
function fourcc(buf: Uint8Array, off: number): string {
  return td.decode(buf.subarray(off, off + 4));
}

type Box = { size: number; type: string; start: number; end: number; payloadStart: number };

function readBox(buf: Uint8Array, off: number): Box | null {
  if (off + 8 > buf.length) return null;
  let size = u32(buf, off);
  const type = fourcc(buf, off + 4);
  let payloadStart = off + 8;
  if (size === 1) {
    // largesize u64 — limitamos a 32-bit (suficiente até 4GB)
    const hi = u32(buf, off + 8);
    const lo = u32(buf, off + 12);
    if (hi !== 0) return null;
    size = lo;
    payloadStart = off + 16;
  } else if (size === 0) {
    size = buf.length - off;
  }
  if (size < 8 || off + size > buf.length) return null;
  return { size, type, start: off, end: off + size, payloadStart };
}

function findChildren(buf: Uint8Array, payloadStart: number, end: number): Box[] {
  const out: Box[] = [];
  let off = payloadStart;
  while (off < end) {
    const box = readBox(buf, off);
    if (!box) break;
    out.push(box);
    off = box.end;
  }
  return out;
}

function findChain(buf: Uint8Array, types: string[]): Box | null {
  let children = findChildren(buf, 0, buf.length);
  let match: Box | null = null;
  for (const t of types) {
    const found = children.find((b) => b.type === t);
    if (!found) return null;
    match = found;
    // Para o próximo nível, pula o cabeçalho do container.
    // Os containers que usamos (moov/trak/mdia/minf) NÃO têm full-box header,
    // então o payload começa imediatamente após size+type.
    children = findChildren(buf, found.payloadStart, found.end);
  }
  return match;
}

function findAllChains(buf: Uint8Array, types: string[]): Box[] {
  // Para tipos repetidos (várias trak no moov), encontra todas as folhas que
  // batem com a cadeia. Simples: caminha recursivamente.
  function descend(payloadStart: number, end: number, idx: number): Box[] {
    const children = findChildren(buf, payloadStart, end);
    if (idx === types.length - 1) {
      return children.filter((b) => b.type === types[idx]);
    }
    const matches = children.filter((b) => b.type === types[idx]);
    const out: Box[] = [];
    for (const m of matches) {
      out.push(...descend(m.payloadStart, m.end, idx + 1));
    }
    return out;
  }
  return descend(0, buf.length, 0);
}

// ============ Seed determinístico ============
async function deriveSeedBytes(seed: string, length: number): Promise<Uint8Array> {
  const hashBuf = await crypto.subtle.digest("SHA-256", te.encode(seed));
  const out = new Uint8Array(length);
  const src = new Uint8Array(hashBuf);
  for (let i = 0; i < length; i++) out[i] = src[i % src.length];
  return out;
}

const FAKE_ENCODERS = [
  "Lavf58.45.100",
  "Lavf58.76.100",
  "Lavf59.16.100",
  "HandBrake 1.5.1",
  "HandBrake 1.6.1",
  "Adobe Premiere Pro 23.1",
  "Adobe Premiere Pro 22.6",
  "iMovie 10.3.5",
];

function pad(s: string, len: number): string {
  if (s.length >= len) return s.slice(0, len);
  return s + " ".repeat(len - s.length);
}

// MP4 epoch: 1904-01-01 UTC, em segundos.
const MP4_EPOCH_OFFSET = 2_082_844_800;

export type VariantResult = {
  bytes: Uint8Array;
  changes: {
    uuidInjected: boolean;
    timestampsUpdated: number;
    smhdBalanceUpdated: number;
    encoderRewritten: boolean;
    xmpErased: boolean;
    dayRewritten: boolean;
  };
};

export async function variateMp4(
  input: Uint8Array,
  seed: string,
): Promise<VariantResult> {
  // Cópia mutável — não tocamos no input do caller.
  const buf = new Uint8Array(input.length);
  buf.set(input);

  const seedBytes = await deriveSeedBytes(seed, 64);

  // ---- 1. Timestamps em mvhd / tkhd / mdhd ----
  // Faixa: 2022-01-01 .. 2024-12-31
  const start2022 = Math.floor(new Date("2022-01-01T00:00:00Z").getTime() / 1000);
  const end2024 = Math.floor(new Date("2024-12-31T23:59:59Z").getTime() / 1000);
  const range = end2024 - start2022;
  const seedNum =
    (seedBytes[0] << 24) | (seedBytes[1] << 16) | (seedBytes[2] << 8) | seedBytes[3];
  const fakeUnix = start2022 + (Math.abs(seedNum) % range);
  const fakeMp4Time = fakeUnix + MP4_EPOCH_OFFSET;

  const headerBoxes: Box[] = [];
  const mvhd = findChain(buf, ["moov", "mvhd"]);
  if (mvhd) headerBoxes.push(mvhd);
  for (const tkhd of findAllChains(buf, ["moov", "trak", "tkhd"])) headerBoxes.push(tkhd);
  for (const mdhd of findAllChains(buf, ["moov", "trak", "mdia", "mdhd"])) headerBoxes.push(mdhd);

  let timestampsUpdated = 0;
  for (const b of headerBoxes) {
    const version = buf[b.payloadStart];
    // payload: version(1) + flags(3) + creation_time + modification_time + ...
    // version 0 → u32 timestamps; version 1 → u64.
    const tsOff = b.payloadStart + 4;
    if (version === 0) {
      if (b.payloadStart + 12 > b.end) continue;
      writeU32(buf, tsOff, fakeMp4Time);
      writeU32(buf, tsOff + 4, fakeMp4Time);
      timestampsUpdated++;
    } else if (version === 1) {
      if (b.payloadStart + 20 > b.end) continue;
      // hi u32 = 0
      writeU32(buf, tsOff, 0);
      writeU32(buf, tsOff + 4, fakeMp4Time);
      writeU32(buf, tsOff + 8, 0);
      writeU32(buf, tsOff + 12, fakeMp4Time);
      timestampsUpdated++;
    }
  }

  // ---- 2. smhd balance ±0.5% ----
  // smhd: version(1) + flags(3) + balance(int16 fixed 8.8) + reserved(2)
  let smhdBalanceUpdated = 0;
  for (const smhd of findAllChains(buf, ["moov", "trak", "mdia", "minf", "smhd"])) {
    const balOff = smhd.payloadStart + 4;
    if (balOff + 2 > smhd.end) continue;
    // valor mínimo (±0.5% = ±0.005 * 256 ≈ ±1.28 em fixed 8.8)
    // usa ±1 ou ±2 dependendo do seed.
    const sign = seedBytes[8] & 1 ? 1 : -1;
    const mag = 1 + (seedBytes[9] & 1);
    const newBal = sign * mag;
    buf[balOff] = (newBal >> 8) & 0xff;
    buf[balOff + 1] = newBal & 0xff;
    smhdBalanceUpdated++;
  }

  // ---- 3. ©too encoder string em moov.udta.meta.ilst.©too.data ----
  // Best-effort: se existir, sobrescreve in-place mantendo o mesmo tamanho.
  // ©too tem 4 bytes (0xA9 't' 'o' 'o').
  let encoderRewritten = false;
  const TOO = new Uint8Array([0xa9, 0x74, 0x6f, 0x6f]);
  const fakeEnc = FAKE_ENCODERS[seedBytes[10] % FAKE_ENCODERS.length];
  outer: for (let i = 0; i < buf.length - 4; i++) {
    if (
      buf[i] === TOO[0] &&
      buf[i + 1] === TOO[1] &&
      buf[i + 2] === TOO[2] &&
      buf[i + 3] === TOO[3]
    ) {
      // i-4 = size do box ©too. dentro dele esperamos um data box.
      const tooStart = i - 4;
      if (tooStart < 0) continue;
      const tooSize = u32(buf, tooStart);
      if (tooSize < 16 || tooStart + tooSize > buf.length) continue;
      // Procura um sub-box "data" dentro.
      let off = tooStart + 8;
      const tooEnd = tooStart + tooSize;
      while (off < tooEnd - 8) {
        const dSize = u32(buf, off);
        const dType = fourcc(buf, off + 4);
        if (dType === "data" && dSize >= 16 && off + dSize <= tooEnd) {
          // data box: size(4) type(4) version(1) flags(3) locale(4) payload...
          const payloadOff = off + 16;
          const payloadLen = off + dSize - payloadOff;
          if (payloadLen > 0) {
            const padded = pad(fakeEnc, payloadLen);
            const padBytes = te.encode(padded);
            for (let k = 0; k < payloadLen; k++) {
              buf[payloadOff + k] = padBytes[k] ?? 0x20;
            }
            encoderRewritten = true;
            break outer;
          }
        }
        if (dSize < 8) break;
        off += dSize;
      }
    }
  }

  // ---- 4. uuid box no fim do arquivo ----
  // size(4) + 'uuid'(4) + uuid(16) + payload(32 bytes do seed)
  const uuidPayload = seedBytes.slice(0, 32);
  // UUID customizado (não-Microsoft, não-XMP). Primeiros 4 bytes = "LOVB".
  const uuidId = new Uint8Array([
    0x4c, 0x4f, 0x56, 0x42, // "LOVB"
    seedBytes[16], seedBytes[17], seedBytes[18], seedBytes[19],
    seedBytes[20], seedBytes[21], seedBytes[22], seedBytes[23],
    seedBytes[24], seedBytes[25], seedBytes[26], seedBytes[27],
  ]);
  const uuidBox = new Uint8Array(8 + 16 + uuidPayload.length);
  writeU32(uuidBox, 0, uuidBox.length);
  uuidBox[4] = 0x75; uuidBox[5] = 0x75; uuidBox[6] = 0x69; uuidBox[7] = 0x64; // 'uuid'
  uuidBox.set(uuidId, 8);
  uuidBox.set(uuidPayload, 24);

  const out = new Uint8Array(buf.length + uuidBox.length);
  out.set(buf, 0);
  out.set(uuidBox, buf.length);

  return {
    bytes: out,
    changes: {
      uuidInjected: true,
      timestampsUpdated,
      smhdBalanceUpdated,
      encoderRewritten,
    },
  };
}
