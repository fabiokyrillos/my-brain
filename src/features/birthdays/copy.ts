import type { Locale } from "@/lib/preferences";

/** Life Brain C.5 (ADR-156) — a person's birthday. Typed, both locales. */
export type BirthdayCopy = {
  readonly label: string;
  readonly none: string;
  readonly set: string;
  readonly change: string;
  readonly clear: string;
  readonly save: string;
  readonly saving: string;
  readonly day: string;
  readonly month: string;
  readonly year: string;
  readonly yearHint: string;
  readonly reminderNote: string;
  readonly reminderTitle: (name: string) => string;
  readonly months: readonly string[];
  readonly format: (day: number, month: number, year: number | null) => string;
  readonly saved: string;
  readonly cleared: string;
  readonly unchanged: string;
  readonly invalid: string;
  readonly failed: string;
  /** ADR-158: the record page offers a birthday the record states. */
  readonly proposalHeading: string;
  readonly proposal: (name: string, date: string) => string;
  readonly accept: string;
  readonly adjust: (name: string) => string;
};

const PT_MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const copy: Record<Locale, BirthdayCopy> = {
  "pt-BR": {
    label: "Aniversário",
    none: "Sem data de aniversário.",
    set: "Adicionar aniversário",
    change: "Mudar",
    clear: "Remover aniversário",
    save: "Salvar aniversário",
    saving: "Salvando…",
    day: "Dia",
    month: "Mês",
    year: "Ano (opcional)",
    yearHint: "Sem o ano, o lembrete vem todo ano do mesmo jeito.",
    reminderNote: "Um lembrete anual chega às 9h do dia.",
    reminderTitle: (name) => `Aniversário de ${name}`,
    months: PT_MONTHS,
    format: (day, month, year) => `${day} de ${PT_MONTHS[month - 1]}${year ? ` de ${year}` : ""}`,
    saved: "Aniversário salvo. O lembrete anual está na sua agenda.",
    cleared: "Aniversário removido, e o lembrete anual encerrado.",
    unchanged: "Nada mudou.",
    invalid: "Essa data não existe. Revise o dia e o mês.",
    failed: "Não foi possível salvar o aniversário agora.",
    proposalHeading: "Aniversário no registro",
    proposal: (name, date) => `Guardar o aniversário de ${name}: ${date}?`,
    accept: "Guardar aniversário",
    adjust: (name) => `Outra data? Ajuste na página de ${name}.`,
  },
  en: {
    label: "Birthday",
    none: "No birthday set.",
    set: "Add birthday",
    change: "Change",
    clear: "Remove birthday",
    save: "Save birthday",
    saving: "Saving…",
    day: "Day",
    month: "Month",
    year: "Year (optional)",
    yearHint: "Without the year, the reminder still comes every year.",
    reminderNote: "A yearly reminder arrives at 9am on the day.",
    reminderTitle: (name) => `${name}'s birthday`,
    months: EN_MONTHS,
    format: (day, month, year) => `${EN_MONTHS[month - 1]} ${day}${year ? `, ${year}` : ""}`,
    saved: "Birthday saved. The yearly reminder is on your agenda.",
    cleared: "Birthday removed, and the yearly reminder ended.",
    unchanged: "Nothing changed.",
    invalid: "That date does not exist. Check the day and the month.",
    failed: "Could not save the birthday right now.",
    proposalHeading: "Birthday in this record",
    proposal: (name, date) => `Keep ${name}'s birthday: ${date}?`,
    accept: "Keep birthday",
    adjust: (name) => `A different date? Adjust it on ${name}'s page.`,
  },
};

export function getBirthdayCopy(locale: Locale): BirthdayCopy {
  return copy[locale];
}
