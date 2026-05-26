// Estoque de contas de contingência — persistido em localStorage.
// Storage separado das contas principais (Graph API).

export type ContingencyStatus = "em_edicao" | "pronta" | "em_uso" | "descartada";
export type ContingencyQuality = "boa" | "media" | "ruim";
export type ConnectionType = "instagram" | "facebook";

export type ContingencyAccount = {
  id: string;
  username: string;
  password: string;
  totp_secret: string;
  status: ContingencyStatus;
  quality: ContingencyQuality;
  notes: string;
  updated_at: string;
  connection_type?: ConnectionType;
  order?: number;
};

export type ActivationLog = {
  id: string;
  contingency_id: string;
  contingency_username: string;
  replaced_account_id: string;
  replaced_username: string;
  reason: string;
  activated_at: string;
};

const ACTIVATION_LOG_KEY = "im_contingency_activations_v1";

export function loadActivationLog(): ActivationLog[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(ACTIVATION_LOG_KEY) ?? "[]"); } catch { return []; }
}
export function appendActivationLog(entry: ActivationLog) {
  if (typeof window === "undefined") return;
  const list = loadActivationLog();
  list.unshift(entry);
  localStorage.setItem(ACTIVATION_LOG_KEY, JSON.stringify(list));
}
export function logsForContingency(id: string): ActivationLog[] {
  return loadActivationLog().filter((l) => l.contingency_id === id);
}

const STORAGE_KEY = "im_contingency_v1";

export const STATUS_META: Record<
  ContingencyStatus,
  { label: string; color: string }
> = {
  em_edicao: { label: "Em Edição", color: "var(--accent2)" },
  pronta: { label: "Pronta", color: "var(--success)" },
  em_uso: { label: "Em Uso", color: "var(--info)" },
  descartada: { label: "Descartada", color: "var(--danger)" },
};

export const QUALITY_META: Record<ContingencyQuality, { label: string; color: string }> = {
  boa: { label: "Boa", color: "var(--success)" },
  media: { label: "Média", color: "var(--warning)" },
  ruim: { label: "Ruim", color: "var(--danger)" },
};

export function loadContingency(): ContingencyAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ContingencyAccount[];
  } catch {
    return [];
  }
}

export function saveContingency(list: ContingencyAccount[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("contingency:changed"));
}

// ---- sync com servidor (D1). Falha silenciosamente em ambientes sem binding. ----
export async function fetchFromServer(): Promise<
  { items: ContingencyAccount[] } | null
> {
  try {
    const res = await fetch("/api/contingency");
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: ContingencyAccount[]; error?: string };
    // Se o servidor reportou erro (ex.: D1 indisponível), não confiamos no payload.
    if (data.error) return null;
    return { items: data.items ?? [] };
  } catch {
    return null;
  }
}

export async function pushOne(item: ContingencyAccount) {
  try {
    await fetch("/api/contingency", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item),
    });
  } catch {
    /* offline / sem binding — apenas cache local */
  }
}

export async function deleteOne(id: string) {
  try {
    await fetch(`/api/contingency/${id}`, { method: "DELETE" });
  } catch {
    /* idem */
  }
}

export async function replaceAllOnServer(items: ContingencyAccount[]) {
  try {
    await fetch("/api/contingency", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replaceAll: true, items }),
    });
  } catch {
    /* idem */
  }
}

export function newAccount(partial: Partial<ContingencyAccount> = {}): ContingencyAccount {
  return {
    id: crypto.randomUUID(),
    username: "",
    password: "",
    totp_secret: "",
    status: "em_edicao",
    quality: "boa",
    notes: "",
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

// ---- CSV ----
function csvEscape(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(list: ContingencyAccount[]): string {
  const header = ["ordem", "username", "password", "token2fa", "status", "quality", "notes", "tipo", "updated_at"];
  const lines = [header.join(",")];
  for (const a of list) {
    lines.push(
      [a.order ?? "", a.username, a.password, a.totp_secret, a.status, a.quality, a.notes, a.connection_type ?? "instagram", a.updated_at]
        .map((v) => csvEscape(String(v ?? "")))
        .join(","),
    );
  }
  return lines.join("\n");
}


function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"') inQ = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function fromCSV(text: string): ContingencyAccount[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const idxAny = (...keys: string[]) => {
    for (const k of keys) {
      const i = header.indexOf(k);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iUser = idxAny("username", "usuario", "usuário", "user");
  const iPass = idxAny("password", "senha", "pass");
  const iTotp = idxAny("token2fa", "totp_secret", "token_2fa", "2fa", "secret", "otp_secret");
  const iStatus = idxAny("status");
  const iQuality = idxAny("quality", "qualidade");
  const iNotes = idxAny("notes", "notas");
  const iType = idxAny("tipo", "connection_type", "type");
  const iOrder = idxAny("ordem", "order", "numero", "número", "n", "num", "#");

  const normStatus = (s: string): ContingencyStatus => {
    const v = s.trim().toLowerCase();
    if (v.includes("uso")) return "em_uso";
    if (v.includes("descart")) return "descartada";
    if (v.includes("pront")) return "pronta";
    return "em_edicao";
  };
  const normQuality = (s: string): ContingencyQuality => {
    const v = s.trim().toLowerCase();
    if (v.startsWith("m")) return "media";
    if (v.startsWith("r")) return "ruim";
    return "boa";
  };
  const normType = (s: string): ConnectionType => {
    const v = (s ?? "").trim().toLowerCase();
    if (v.startsWith("f") || v.includes("face")) return "facebook";
    return "instagram";
  };

  const out: ContingencyAccount[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    // Ignorar linhas em branco (todos os campos vazios)
    if (cells.every((c) => (c ?? "").trim() === "")) continue;
    const username = iUser >= 0 ? (cells[iUser] ?? "").trim() : "";
    if (!username) continue;
    out.push(
      newAccount({
        username,
        password: iPass >= 0 ? cells[iPass] ?? "" : "",
        totp_secret: iTotp >= 0 ? (cells[iTotp] ?? "").replace(/\s+/g, "") : "",
        status: iStatus >= 0 ? normStatus(cells[iStatus] ?? "") : "em_edicao",
        quality: iQuality >= 0 ? normQuality(cells[iQuality] ?? "") : "boa",
        notes: iNotes >= 0 ? cells[iNotes] ?? "" : "",
        connection_type: iType >= 0 ? normType(cells[iType] ?? "") : "instagram",
      }),
    );
  }
  return out;
}

