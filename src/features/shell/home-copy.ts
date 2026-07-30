import type { Locale } from "@/lib/preferences";

/**
 * Home's copy, as a typed feature module.
 *
 * Moved out of `src/i18n/messages.ts` — which stays the shell/navigation
 * catalogue — into the `daily-cycle/copy.ts` shape the engineering standards name
 * as canonical for feature copy (ADR-036). The move is what lets the ordinal
 * kickers go: `01 / AGORA`, `02 / PRECISA DE VOCÊ`, `03 / CONTEXTO`, `04 /
 * CLAREZA` and `06 / RECENTE` were hardcoded Portuguese string literals inside
 * the component, so an English user read `PRECISA DE VOCÊ` on their own Home
 * (UX-18).
 *
 * `src/features/shell/operational-copy.test.ts` audits this file for unsupported
 * continuous-attention promises, exactly as it audited the strings' previous home.
 */
export type HomeCopy = {
  readonly greeting: string;
  readonly prompt: string;
  /** The one-line answer to "what is my state right now". */
  readonly statusAttentionOne: string;
  readonly statusAttentionMany: string;
  readonly statusOrganizingOne: string;
  readonly statusOrganizingMany: string;
  readonly statusAllSaved: string;
  readonly sections: {
    readonly attention: { readonly title: string; readonly hint: string; readonly empty: string };
    readonly today: { readonly title: string; readonly hint: string; readonly empty: string };
    readonly waiting: { readonly title: string; readonly one: string; readonly many: string };
    readonly question: { readonly title: string; readonly empty: string };
    readonly recent: { readonly title: string; readonly empty: string };
  };
  readonly viewAll: string;
  readonly viewAllWork: string;
  readonly viewAllRecords: string;
  readonly answerQuestion: string;
};

export const homeCopy = {
  "pt-BR": {
    greeting: "Boa tarde.",
    prompt: "O que merece sua atenção agora?",
    statusAttentionOne: "1 item precisa de você.",
    statusAttentionMany: "{count} itens precisam de você.",
    statusOrganizingOne: "1 registro ainda está sendo organizado.",
    statusOrganizingMany: "{count} registros ainda estão sendo organizados.",
    statusAllSaved: "Nada pendente. Tudo salvo.",
    sections: {
      attention: {
        title: "Precisa de você",
        hint: "Decisões que o Brain não toma sozinho.",
        empty: "Nada precisa de você agora.",
      },
      today: {
        title: "Para hoje",
        hint: "Prazos de hoje e atrasos ainda abertos.",
        empty: "Nenhum prazo exige sua atenção hoje.",
      },
      waiting: {
        title: "Aguardando outras pessoas",
        one: "1 item depende de retorno.",
        many: "{count} itens dependem de retorno.",
      },
      question: {
        title: "Pergunta em aberto",
        empty: "Nenhuma pergunta em aberto.",
      },
      recent: {
        title: "Registrado recentemente",
        empty: "Nada por aqui ainda. Capture algo para começar.",
      },
    },
    viewAll: "Ver tudo",
    viewAllWork: "Ver todo o trabalho",
    viewAllRecords: "Ver todos os registros",
    answerQuestion: "Responder",
  },
  en: {
    greeting: "Good afternoon.",
    prompt: "What deserves your attention now?",
    statusAttentionOne: "1 item needs you.",
    statusAttentionMany: "{count} items need you.",
    statusOrganizingOne: "1 record is still being organized.",
    statusOrganizingMany: "{count} records are still being organized.",
    statusAllSaved: "Nothing pending. Everything is saved.",
    sections: {
      attention: {
        title: "Needs you",
        hint: "Decisions Brain will not make on its own.",
        empty: "Nothing needs you right now.",
      },
      today: {
        title: "For today",
        hint: "Today's deadlines and overdue work still open.",
        empty: "No deadline needs your attention today.",
      },
      waiting: {
        title: "Waiting on other people",
        one: "1 item is waiting for a response.",
        many: "{count} items are waiting for a response.",
      },
      question: {
        title: "Open question",
        empty: "No open questions.",
      },
      recent: {
        title: "Recently captured",
        empty: "Nothing here yet. Capture something to get started.",
      },
    },
    viewAll: "View all",
    viewAllWork: "View all work",
    viewAllRecords: "View all records",
    answerQuestion: "Answer",
  },
} as const satisfies Record<Locale, HomeCopy>;

export function getHomeCopy(locale: Locale): HomeCopy {
  return homeCopy[locale];
}

/** Substitutes the single `{count}` placeholder the plural strings carry. */
export function withCount(template: string, count: number | string): string {
  return template.replace("{count}", String(count));
}
