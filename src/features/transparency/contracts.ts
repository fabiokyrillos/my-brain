/**
 * Dados e IA — the transparency centre, as one place with three views.
 *
 * ## What the handoff asks for, and what is actually built
 *
 * `02-arquitetura-e-rotas.md` puts **Atividade**, **Custos** and
 * **Processamento** as three tabs of `/app/settings`, with `/app/history`,
 * `/app/costs` and `/app/jobs` *redirecting* to them.
 *
 * The redirect is deliberately not built. ADR-114 Decision 6 preserves every
 * current URL, and a redirect would end three routes as rendering surfaces —
 * taking their filters, their pagination and their deep links with them, since a
 * tab of Settings would have to re-implement all of it. What ships instead is
 * the same move Brain's lenses and Trabalho's modes make: **each route stays
 * exactly what it is, and wears the strip that says the three are one thing.**
 * Settings gains a Dados e IA section that names and reaches all three.
 *
 * The requirement the handoff is really making — *nenhuma delas na navegação
 * primária*, and *"Jobs" deixa de ser conceito de usuário* — is met, and it was
 * already half met: `history` and `costs` sit in the `transparency` group at
 * `more` visibility, and `jobs` is `context-only` with no menu entry at all.
 *
 * ## Why the membership is derived, and what that derivation is for
 *
 * `TRANSPARENCY_MENU_MEMBERS` reads `group: "transparency"` off
 * `capabilities.ts`. It is **not** what the surfaces render — the strip and the
 * section both map `TRANSPARENCY_LENSES` — and its whole job is to be the
 * guard's *independent* second opinion: `transparency.test.tsx` compares the two
 * and fails when the registry gains a member this file has not answered for.
 *
 * That is the intended behaviour rather than a shortfall, and it differs from
 * Brain's lenses on purpose. See `TRANSPARENCY_LENSES` below for why a fourth
 * view has to fail rather than appear.
 *
 * `jobs` is named rather than derived because it is *not* in that group — it is
 * `advanced`/`context-only`, reached from a failure — so a list built from the
 * group alone would silently drop it.
 */

import { navigationCapabilities, type NavigationKey } from "@/features/shell/capabilities";

/** The menu-visible transparency destinations, derived. */
export const TRANSPARENCY_MENU_MEMBERS: readonly NavigationKey[] = navigationCapabilities
  .filter((capability) => capability.group === "transparency")
  .map((capability) => capability.key);

/**
 * The advanced one, named rather than derived.
 *
 * `jobs` carries `visibility: "context-only"` and no navigation label, which is
 * the handoff's requirement — it is reached from a failure, not from a menu.
 * That is exactly why it cannot come from the group filter above, and why a
 * guard asserts it stays `context-only` rather than quietly acquiring an entry.
 */
export const TRANSPARENCY_ADVANCED_MEMBER = "jobs" as const satisfies NavigationKey;

/**
 * The strip, in reading order: what happened, what it cost, what is still
 * running.
 *
 * **Listed, and a fourth transparency destination FAILS the build rather than
 * appearing here.** That is the opposite of how Brain composes its lenses, and
 * the difference is the copy: a Brain lens takes its label from `messages.nav`,
 * which every navigation key has, so a ninth can appear with nothing written.
 * A view here needs a **tab word and a sentence** in `TransparencyCopy`, which
 * no compiler can invent — so composing this list would produce a tab labelled
 * `undefined`.
 *
 * The header above this file once claimed a fourth would "appear here tomorrow".
 * It would not, and an independent review of the branch found the gap between
 * that claim and the code. Failing is the right behaviour; overstating it was
 * not.
 */
export const TRANSPARENCY_LENSES = [
  "history",
  "costs",
  TRANSPARENCY_ADVANCED_MEMBER,
] as const satisfies readonly NavigationKey[];

export type TransparencyLens = (typeof TRANSPARENCY_LENSES)[number];
