import type { Locale } from "@/lib/preferences";

/**
 * Copy for the three review preferences — `2O-PREF-004` and `2O-PREF-005`.
 *
 * It is a typed module rather than more inline ternaries because
 * `docs/ENGINEERING_STANDARDS.md` makes that the canonical mechanism for new
 * copy and UX-22's rule is that a slice leaves no more ternaries than it found.
 * `settings-form.tsx` still carries the ones it was written with; the ones this
 * slice would have added are here.
 *
 * ## `2O-PREF-005` is the whole reason this copy is careful
 *
 * `/app/reviews` promises, in both languages, that **nothing runs from a
 * configured schedule** — and `phase-2m-inert-preferences-guard.test.ts` holds
 * that sentence in place. A control labelled "daily review time" sitting next to
 * that promise is a contradiction unless it says what it actually does, so every
 * string below describes **when a surface offers to close the day**, never when
 * something runs, fires, sends, or is delivered.
 *
 * There is no scheduler behind these columns. `day-review/review-schedule.ts`
 * reads them to decide what a page the user opened says, and that is all. If a
 * review ever does become scheduled, `2O-PREF-006` requires this copy and that
 * sentence to be corrected in the same change.
 */
export type ReviewPreferencesCopy = Readonly<{
  sectionTitle: string;
  sectionDescription: string;
  dailyLabel: string;
  dailyHint: string;
  weeklyDayLabel: string;
  weeklyTimeLabel: string;
  weeklyHint: string;
  /** Sunday-first, matching `Date.getUTCDay()` and the stored column. */
  weekdays: readonly [string, string, string, string, string, string, string];
}>;

const copy: Record<Locale, ReviewPreferencesCopy> = {
  "pt-BR": {
    sectionTitle: "Revisões",
    sectionDescription:
      "Definem a partir de quando a página de revisões oferece fechar o dia ou a semana. Nada é executado por horário configurado.",
    dailyLabel: "Fechamento do dia a partir de",
    dailyHint:
      "Depois deste horário, a página de revisões passa a oferecer o fechamento do dia. Você continua gerando revisões quando quiser.",
    weeklyDayLabel: "Dia do fechamento da semana",
    weeklyTimeLabel: "Fechamento da semana a partir de",
    weeklyHint:
      "Mesma ideia, uma vez por semana. Nenhuma revisão é gerada sozinha nem enviada para você.",
    weekdays: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
  },
  en: {
    sectionTitle: "Reviews",
    sectionDescription:
      "These set when the reviews page starts offering to close the day or the week. Nothing runs from a configured schedule.",
    dailyLabel: "Offer to close the day from",
    dailyHint:
      "After this time, the reviews page starts offering to close the day. You can still generate a review whenever you want.",
    weeklyDayLabel: "Day the week closes",
    weeklyTimeLabel: "Offer to close the week from",
    weeklyHint:
      "The same idea, once a week. No review is generated on its own, and none is sent to you.",
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
};

export function getReviewPreferencesCopy(locale: Locale): ReviewPreferencesCopy {
  return copy[locale];
}
