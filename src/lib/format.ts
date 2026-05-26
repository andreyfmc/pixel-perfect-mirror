// Date formatters. Para datas vindas do servidor (ISO em UTC), usamos o fuso
// LOCAL do dispositivo — assim o usuário vê o horário que ele agendou.
// A formatação só roda no client (componentes), então não há mismatch de SSR.
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const dateShort = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

const dateFull = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export const fmtDateTime = (iso: string) => dateTime.format(new Date(iso));
export const fmtDateShort = (iso: string) => dateShort.format(new Date(iso));
export const fmtDateFull = (iso: string) => dateFull.format(new Date(iso));

