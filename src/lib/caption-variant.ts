// Caption uniqueness: insere espaços invisíveis Unicode em posições determinísticas
// (seed = accountId+driveFileId) para que cada conta tenha uma legenda binariamente
// única, mesmo quando o texto visível é idêntico.
//
// Caracteres usados:
//   U+200B  Zero-Width Space
//   U+FEFF  Zero-Width No-Break Space
//   U+2060  Word Joiner
//
// Todos são invisíveis em qualquer renderer (Instagram, navegadores, etc).

const INVISIBLES = ["\u200B", "\uFEFF", "\u2060"];

function hash32(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function variateCaption(caption: string, seed: string): string {
  if (!caption) return caption;
  const h = hash32(seed);
  // 2 a 4 inserções por caption.
  const count = 2 + (h % 3);
  const chars = Array.from(caption);
  for (let i = 0; i < count; i++) {
    const slotSeed = hash32(`${seed}:${i}`);
    const pos = chars.length > 0 ? slotSeed % (chars.length + 1) : 0;
    const ch = INVISIBLES[(slotSeed >> 8) % INVISIBLES.length];
    chars.splice(pos, 0, ch);
  }
  return chars.join("");
}
