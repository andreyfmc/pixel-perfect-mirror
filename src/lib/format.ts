// Date formatters. Usa fuso fixo para SSR e client renderizarem o mesmo texto.
const APP_TIME_ZONE = "America/Sao_Paulo";
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const dateShort = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "short",
});

const dateFull = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export const fmtDateTime = (iso: string) => dateTime.format(new Date(iso));
export const fmtDateShort = (iso: string) => dateShort.format(new Date(iso));
export const fmtDateFull = (iso: string) => dateFull.format(new Date(iso));

