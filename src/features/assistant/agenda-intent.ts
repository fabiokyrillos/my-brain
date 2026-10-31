/**
 * Life Brain B.1 (`LB-B-005`) — is this utterance an **agenda question**?
 *
 * Deterministic and declared, like `memory-intent.ts` and `capture-intent.ts`:
 * the routing decision is data in this module, not a heuristic inside a prompt.
 * Pure and synchronous — no clock and no zone. The span it returns is
 * *relative* ("tomorrow", "next week"); turning it into dates needs the owner's
 * zone and the server's clock, and that is `agenda-answer.ts`'s job.
 *
 * ## The error costs, and why the rule is narrow
 *
 * A match skips the command parse **and** the knowledge answer, so:
 *
 * 1. **A false positive answers the wrong question** — "mova a tarefa para
 *    amanhã" read as "what do I have tomorrow" would list the day instead of
 *    moving the task. So the sentence must *open* like an agenda question
 *    (`AGENDA_OPENERS`); a day word alone is never enough.
 * 2. **A false negative costs what the turn cost before this slice** — the
 *    command parse, then the grounded answer. Nothing is lost but the saving.
 *
 * That asymmetry is why every doubtful shape returns `null`: two windows in one
 * sentence, a qualifier the agenda cannot honour ("com a Ana", "about the
 * trip"), a named month (B.3's parser), a past tense, or a long text.
 *
 * Locale-free, for the reason `memory-intent.ts` gives: a bilingual owner types
 * in whichever language the thought arrived in.
 */

import { normalize } from "./memory-intent";

/** The window an agenda question names, before any zone or clock is applied. */
export type AgendaSpan =
  | { readonly kind: "day"; readonly offset: 0 | 1 | 2 }
  | { readonly kind: "week"; readonly offset: 0 | 1 }
  | { readonly kind: "month"; readonly offset: 0 | 1 }
  | { readonly kind: "day_of_month"; readonly day: number };

/** An agenda question is short; past this it is something the model should read. */
export const MAX_AGENDA_QUESTION_LENGTH = 120;

/**
 * How an agenda question opens, in `normalize`'s form (unaccented, lowercase,
 * apostrophes removed — "what's" is `whats`).
 *
 * Every entry is a *question about what is scheduled*. Imperatives are absent
 * by design — they are the command parser's — and so is the bare "tenho …":
 * "tenho dentista amanhã" is a statement, and only "tenho algo / alguma coisa /
 * algum compromisso" asks.
 */
const AGENDA_OPENERS: readonly RegExp[] = [
  // pt-BR
  /^(e )?o que (eu )?tenho\b/u,
  /^(e )?(eu )?tenho (algo|alguma coisa|algum compromisso|compromisso|compromissos)\b/u,
  /^(e )?(qual|como) (e |esta |ta )?(a )?minha agenda\b/u,
  /^(e )?minha agenda\b/u,
  /^(e )?(quais|qual) (sao |e )?(os )?meus compromissos\b/u,
  /^(e )?o que (tem|ha) na (minha )?agenda\b/u,
  // en
  /^(and )?what do i have\b/u,
  /^(and )?whats on\b/u,
  /^(and )?what is on\b/u,
  /^(and )?do i have (anything|something|any plans)\b/u,
  /^(and )?(whats|what is|how is|hows) my (agenda|schedule|calendar)\b/u,
  /^(and )?my (agenda|schedule|calendar)\b/u,
];

/**
 * Words that narrow the question to something the agenda cannot answer. The
 * projection lists *everything* in the window; "o que tenho amanhã com a Ana"
 * answered with the whole day would look precise and be wrong.
 */
const QUALIFIERS = /\b(com|sobre|with|about|regarding)\b/u;

/** "What do I have to do / to buy" asks about work, not about a window. */
const HAVE_TO = /^(and )?what do i have to\b/u;

const MONTH_NAMES =
  /\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|january|february|march|april|may|june|july|august|september|october|november|december)\b/u;

/**
 * The windows, each with the phrases that name it.
 *
 * "depois de amanhã" / "day after tomorrow" are listed before "amanhã" /
 * "tomorrow" and removed from the text once matched, so the shorter phrase
 * inside them cannot count as a second window.
 */
const WINDOWS: readonly { readonly pattern: RegExp; readonly span: AgendaSpan }[] = [
  { pattern: /\b(depois de amanha|the day after tomorrow|day after tomorrow)\b/gu, span: { kind: "day", offset: 2 } },
  { pattern: /\b(hoje|hj|today|tonight)\b/gu, span: { kind: "day", offset: 0 } },
  { pattern: /\b(amanha|tomorrow)\b/gu, span: { kind: "day", offset: 1 } },
  { pattern: /\b(proxima semana|semana que vem|next week)\b/gu, span: { kind: "week", offset: 1 } },
  { pattern: /\b((n)?esta semana|(n)?essa semana|this week)\b/gu, span: { kind: "week", offset: 0 } },
  { pattern: /\b(proximo mes|mes que vem|next month)\b/gu, span: { kind: "month", offset: 1 } },
  { pattern: /\b((n)?este mes|(n)?esse mes|this month)\b/gu, span: { kind: "month", offset: 0 } },
];

/** "dia 12", "no dia 3", "on the 12th", "the 3rd". */
const DAY_OF_MONTH = /\b(?:dia (\d{1,2})|(?:on )?the (\d{1,2})(?:st|nd|rd|th))\b/gu;

export function detectAgendaQuestion(text: string): AgendaSpan | null {
  if (text.length > MAX_AGENDA_QUESTION_LENGTH) return null;
  const normalized = normalize(text).replace(/[?!.]+$/u, "").trim();

  if (!AGENDA_OPENERS.some((opener) => opener.test(normalized))) return null;
  if (HAVE_TO.test(normalized) || QUALIFIERS.test(normalized) || MONTH_NAMES.test(normalized)) return null;

  const found: AgendaSpan[] = [];
  let rest = normalized;
  for (const window of WINDOWS) {
    const matches = rest.match(window.pattern);
    if (matches === null) continue;
    // The same window named twice is still one window; two different ones are
    // ambiguous and refused below.
    found.push(window.span);
    rest = rest.replace(window.pattern, " ");
  }
  for (const match of rest.matchAll(DAY_OF_MONTH)) {
    const day = Number(match[1] ?? match[2]);
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    found.push({ kind: "day_of_month", day });
  }

  return found.length === 1 ? found[0]! : null;
}
