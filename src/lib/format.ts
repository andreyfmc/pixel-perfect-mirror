// Date formatters fixed to UTC so SSR output matches client hydration.
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const dateShort = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const dateFull = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export const fmtDateTime = (iso: string) => dateTime.format(new Date(iso));
export const fmtDateShort = (iso: string) => dateShort.format(new Date(iso));
export const fmtDateFull = (iso: string) => dateFull.format(new Date(iso));
