/**
 * Brain's lenses — the unified space, over the routes that already exist.
 *
 * ## What a lens is here, and what it deliberately is not
 *
 * `02-arquitetura-e-rotas.md` makes Brain the fourth destination and puts
 * Pessoas, Projetos, Empresas, Contextos, Memórias, Arquivos, Relações and
 * Conversas *inside* it. ADR-114 Decision 6 settles how: **every current URL is
 * preserved.** So a lens is not a tab that swaps a panel and not a query
 * parameter over a second loader — it is the same destination it always was,
 * reached by the same URL, wearing the strip that says which part of Brain you
 * are standing in.
 *
 * That is the shape Trabalho already uses for Lista · Calendário · Planejar
 * (`work-modes.tsx`), and it is chosen here for the same three reasons: every
 * bookmark, redirect and deep link keeps working; each lens keeps its own
 * server-rendered loader instead of becoming client state a refresh would lose;
 * and no loader, authorization rule or RLS boundary is duplicated to build a
 * second way in.
 *
 * ## Why the order is declared and the membership is derived
 *
 * `LIBRARY_MEMBERS` reads `group: "context"` off `capabilities.ts`, so the set
 * cannot drift from the navigation. The *order* is a reading decision the data
 * cannot express — people before projects before companies is a sentence about
 * how the owner thinks, not about how the registry is sorted.
 *
 * Composing them as "declared order first, then anything the registry has that
 * the order does not name" makes the invariant that matters structural rather
 * than checked: **a context destination added tomorrow appears in Brain
 * tomorrow.** It lands at the end rather than in a considered position, which is
 * a cosmetic cost; being absent from the space that is supposed to contain
 * everything would be a functional one.
 */

import type { NavigationKey } from "@/features/shell/capabilities";

import { LIBRARY_MEMBERS } from "./contracts";

/** The overview is a lens of Brain, not a separate page above it. */
export type BrainLensKey = "overview" | NavigationKey;

/**
 * The reading order. Conversas is last because it is the way to *ask about* the
 * rest, and the rest has to exist before the question means anything.
 */
const DECLARED_ORDER: readonly NavigationKey[] = [
  "people",
  "projects",
  "organizations",
  "contexts",
  "memories",
  "files",
  "relations",
  "chat",
];

/** Every context destination, in reading order, with nothing lost. */
export const BRAIN_DOMAIN_LENSES: readonly NavigationKey[] = [
  ...DECLARED_ORDER.filter((key) => LIBRARY_MEMBERS.includes(key)),
  ...LIBRARY_MEMBERS.filter((key) => !DECLARED_ORDER.includes(key)),
];

/** The strip, overview first. */
export const BRAIN_LENSES: readonly BrainLensKey[] = ["overview", ...BRAIN_DOMAIN_LENSES];

/**
 * The domains the overview draws a panel for.
 *
 * Identical to `BRAIN_DOMAIN_LENSES` today and derived from it rather than
 * restated, so the strip and the overview can never offer different sets — the
 * failure that would make one lens reachable from the tabs and invisible from
 * the page that is supposed to summarise it.
 */
export const BRAIN_OVERVIEW_DOMAINS = BRAIN_DOMAIN_LENSES;
