import type { Locale } from "@/lib/preferences";
import { withAgentName } from "@/lib/agent-name";

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
    readonly attention: {
      readonly title: string;
      readonly hint: string;
      readonly empty: string;
      /**
       * The account the empty state owes (`04-estados.md`, Hoje **V**): "nothing
       * needs you" is only reassuring next to what *was* organized. Without it
       * the quiet state reads as "nothing happened".
       */
      readonly organizedOne: string;
      readonly organizedMany: string;
      readonly viewOrganized: string;
      /** The expanded lead item's proposal eyebrow — `03-componentes.md`, InterpretationCard. */
      readonly proposes: string;
      /** Said on the lead card, because nothing has been created yet. */
      readonly reversible: string;
    };
    readonly today: { readonly title: string; readonly hint: string; readonly empty: string };
    /**
     * The section that holds both groups of the day's work.
     *
     * The mockup draws one list titled *hoje e atrasado*; `2J-HOJE-004`/`005`
     * require the promoted group to keep its own heading, its cap and its
     * printed rule. So the section is the mockup's, and the two groups inside it
     * are the requirement's — neither is lost.
     */
    readonly day: { readonly title: string };
    /**
     * `02-arquitetura-e-rotas.md` — the day's remaining anchors and what is
     * committed next. Never rendered empty.
     */
    readonly agenda: { readonly title: string; readonly hint: string; readonly viewAll: string };
    /**
     * The asynchronous half of the cycle, as its own quiet panel rather than as
     * an operational status line in the body.
     */
    readonly organizing: { readonly title: string; readonly hint: string };
    /** `2J-HOJE-004`. Up to three, and the heading never promises three. */
    /**
     * The day's other destinations, named once (owner report of 2026-08-20).
     *
     * One string: the row's label, which is both the `<nav>`'s accessible name
     * and the visible eyebrow above it. The destinations themselves reuse the
     * navigation registry's own copy rather than restating three labels here —
     * a second spelling of "Lembretes" is a second thing to keep in step.
     */
    readonly destinations: { readonly label: string };
    /** `2J-DAY-002`/`003`. Closing the day, from Hoje. */
    readonly endOfDay: {
      readonly title: string;
      readonly hint: string;
      readonly clear: string;
      readonly openReview: string;
      readonly unresolved: string;
    };
    readonly priorities: {
      readonly title: string;
      readonly hint: string;
      readonly empty: string;
      /** `2J-HOJE-005`. The rule, in one plain sentence, shown to the user. */
      readonly rule: string;
      readonly reasons: {
        readonly overdue: string;
        readonly due_today: string;
        readonly marked_urgent: string;
      };
    };
    readonly waiting: { readonly title: string; readonly one: string; readonly many: string };
    readonly question: { readonly title: string; readonly empty: string };
  };
  /** Names the cockpit's secondary column for assistive technology. */
  readonly sideColumnLabel: string;
  readonly viewAll: string;
  readonly viewAllWork: string;
  /** `2J-PRIVACY-001`. What a masked row says instead of the content. */
  readonly maskedLabel: string;
  readonly revealLabel: string;
  readonly hideLabel: string;
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
        hint: "Decisões que o {agent} não toma sozinho.",
        empty: "Nada precisa de você agora.",
        organizedOne: "1 registro foi organizado hoje sem ambiguidade.",
        organizedMany: "{count} registros foram organizados hoje sem ambiguidade.",
        viewOrganized: "Ver o que foi organizado",
        proposes: "o {agent} propõe",
        reversible: "Nada foi criado ainda.",
      },
      day: { title: "Hoje e atrasado" },
      agenda: {
        title: "Adiante",
        hint: "O que ainda está comprometido.",
        viewAll: "Abrir o calendário",
      },
      organizing: {
        title: "Sendo organizado",
        hint: "O {agent} está lendo. Você não precisa esperar aqui.",
      },
      destinations: { label: "Ir para" },
      endOfDay: {
        title: "Encerrar o dia",
        hint: "Veja o que ficou em aberto e gere a revisão do dia quando quiser.",
        clear: "Nada ficou em aberto hoje.",
        openReview: "Abrir revisões",
        unresolved: "aberto",
      },
      priorities: {
        title: "Prioridades de hoje",
        hint: "No máximo três. Se menos coisas merecem hoje, menos aparecem.",
        empty: "Nada exige prioridade hoje.",
        rule: "Atrasadas primeiro, depois as de hoje, depois as marcadas como urgentes ou altas.",
        reasons: {
          overdue: "Atrasada",
          due_today: "Vence hoje",
          marked_urgent: "Marcada como urgente",
        },
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
    },
    sideColumnLabel: "Adiante e fechamento do dia",
    viewAll: "Ver tudo",
    viewAllWork: "Ver todo o trabalho",
    maskedLabel: "Conteúdo muito sensível, oculto",
    revealLabel: "Mostrar",
    hideLabel: "Ocultar",
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
        hint: "Decisions {agent} will not make on its own.",
        empty: "Nothing needs you right now.",
        organizedOne: "1 record was organized today with no ambiguity.",
        organizedMany: "{count} records were organized today with no ambiguity.",
        viewOrganized: "See what was organized",
        proposes: "{agent} proposes",
        reversible: "Nothing has been created yet.",
      },
      day: { title: "Today and overdue" },
      agenda: {
        title: "Ahead",
        hint: "What is still committed.",
        viewAll: "Open the calendar",
      },
      organizing: {
        title: "Being organized",
        hint: "{agent} is reading. You do not have to wait here.",
      },
      destinations: { label: "Go to" },
      endOfDay: {
        title: "Close the day",
        hint: "See what is still open and generate the daily review whenever you want.",
        clear: "Nothing was left open today.",
        openReview: "Open reviews",
        unresolved: "open",
      },
      priorities: {
        title: "Today's priorities",
        hint: "At most three. If fewer things deserve today, fewer appear.",
        empty: "Nothing needs priority today.",
        rule: "Overdue first, then due today, then anything marked urgent or high.",
        reasons: {
          overdue: "Overdue",
          due_today: "Due today",
          marked_urgent: "Marked urgent",
        },
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
    },
    sideColumnLabel: "Ahead and closing the day",
    viewAll: "View all",
    viewAllWork: "View all work",
    maskedLabel: "Highly sensitive content, hidden",
    revealLabel: "Show",
    hideLabel: "Hide",
    viewAllRecords: "View all records",
    answerQuestion: "Answer",
  },
} as const satisfies Record<Locale, HomeCopy>;

/**
 * @param agentName the assistant’s configured name (UX-06). Required, so the
 * compiler finds every surface that would otherwise render a hardcoded one.
 */
export function getHomeCopy(locale: Locale, agentName: string): HomeCopy {
  return withAgentName(homeCopy[locale], agentName);
}

/** Substitutes the single `{count}` placeholder the plural strings carry. */
export function withCount(template: string, count: number | string): string {
  return template.replace("{count}", String(count));
}
