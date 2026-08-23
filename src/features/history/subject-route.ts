import type { Locale } from "@/lib/preferences";
import type { HistoryEntityType } from "./vocabulary";

/**
 * Where each kind of subject can be opened — one typed map, not concatenation
 * scattered through the view.
 *
 * ## Why a map and not a template at the call site
 *
 * A link is a promise that the destination exists. Building
 * `/${locale}/app/${entityType}/${entityId}` in the component would produce
 * `/pt-BR/app/pending_question/…` and `/pt-BR/app/entry_interpretation/…`,
 * neither of which is a route, and a 404 reached from a history row reads as
 * lost data rather than as a missing page.
 *
 * So the five entity types with a detail route are listed, the four without one
 * are `null`, and the compiler requires an answer for every member of
 * `HistoryEntityType`. A new entity type cannot be added to the vocabulary
 * without deciding — here, once — whether it is linkable.
 *
 * ## The four that are not linkable, and why
 *
 * - `entry_interpretation` — `entity_id` is the interpretation's own id, not the
 *   entry's, and `/app/inbox/[entryId]` will not accept it. Linking would need
 *   a lookup this surface has no reason to do.
 * - `entry_task_candidate_resolution` — same shape: a resolution row, not an
 *   object with a page.
 * - `pending_question` — `/app/questions` is a list; there is no
 *   `[questionId]` route to send anyone to.
 * - `conversation` — `/app/chat/[conversationId]` *does* exist, so this one is
 *   linked; it is named here only because it is the one people expect to be
 *   missing.
 */
type SubjectRouteBuilder = (locale: Locale, entityId: string) => string;

/**
 * `satisfies` rather than a type annotation, on purpose: it still forces every
 * `HistoryEntityType` to be answered for, and it keeps each value's literal
 * type, so `LinkableEntityType` below can be *derived* from this map instead of
 * being a second list that has to be kept in step with it by hand.
 */
export const HISTORY_SUBJECT_ROUTES = {
  task: (locale, id) => `/${locale}/app/work/${id}`,
  entry: (locale, id) => `/${locale}/app/inbox/${id}`,
  memory: (locale, id) => `/${locale}/app/memories/${id}`,
  project: (locale, id) => `/${locale}/app/projects/${id}`,
  person: (locale, id) => `/${locale}/app/people/${id}`,
  conversation: (locale, id) => `/${locale}/app/chat/${id}`,
  // Slice G5. There is no `/app/reminders/[id]` detail page, so this is the one
  // route in the map that reaches a list plus an anchor rather than a page of
  // its own — `reminder-list.tsx` stamps `id="reminder-<uuid>"` on every row, so
  // the fragment is a real destination and not a hopeful guess. It is linked
  // rather than left null because the destination genuinely shows the subject.
  reminder: (locale, id) => `/${locale}/app/reminders#reminder-${id}`,
  // EGC.1. Both became linkable in the same change that gave them detail
  // routes, which is the ordering this map is meant to enforce: an entity type
  // is linked because its page exists, never because a link would look tidier.
  organization: (locale, id) => `/${locale}/app/organizations/${id}`,
  context: (locale, id) => `/${locale}/app/contexts/${id}`,
  // SH.1 — `entity_id` is the account's own user id; there is no page for an
  // account state, and the state surface is reached by the lifecycle gate,
  // not by a history link.
  account_lifecycle: null,
  // SH.3 — the Jobs page lists jobs but stamps no per-row anchor, so there is
  // no destination that shows this subject. Left null rather than pointed at
  // the list, on the rule the relationship types state below.
  job: null,
  entry_interpretation: null,
  entry_task_candidate_resolution: null,
  pending_question: null,
  // EGC.2 — three more of the same shape as `entry_interpretation`. Each
  // `entity_id` is the junction row's own id, and there is no page for a
  // relationship or a link; the place to see one is the Person it belongs to,
  // whose id these rows do not carry. Linking would need a lookup this surface
  // has no reason to do, and guessing would send the reader to a 404 reached
  // from their own history — which reads as lost data.
  person_relationship: null,
  person_context: null,
  person_project: null,
  // Phase 2P slice 2P.4 — the same shape again. `entity_id` is the undo
  // operation's own id, not the policy row's; the policy is keyed by
  // `(user_id, category)` and has no id at all. The place to see it is the
  // automation section on Settings, and a link built from a category name this
  // row does not carry would be a guess.
  automation_category_policy: null,
  /*
   * Phase 2R slice 2R.1 — **null, and a literal one.**
   *
   * The rule this map states is that a link is offered only where the
   * destination genuinely shows the subject. Slice 2R.1 ships the recurrence
   * model and **no surface**: there is no page for a series, no list and no
   * anchor, so an href here would be a guess dressed as a destination —
   * `2R-TRUST-006` one surface over.
   *
   * It is `null` rather than `() => null` because `LINKABLE_ENTITY_TYPES`
   * derives from `!== null`, so a function returning null would be counted
   * linkable and then checked against a route that does not exist. That is not
   * a nicety: the first draft of this entry did exactly that, and the
   * route-exists assertion caught it.
   *
   * Slice 2R.3 builds the surface, and turns this into a real builder in the
   * commit that does — the assertion above is what makes forgetting impossible.
   */
  reminder_series: null,
} satisfies Record<HistoryEntityType, SubjectRouteBuilder | null>;

/** The entity types whose subject has a page — derived, never re-listed. */
export type LinkableEntityType = {
  [K in HistoryEntityType]: (typeof HISTORY_SUBJECT_ROUTES)[K] extends null ? never : K;
}[HistoryEntityType];

export const LINKABLE_ENTITY_TYPES = (
  Object.keys(HISTORY_SUBJECT_ROUTES) as HistoryEntityType[]
).filter((entityType): entityType is LinkableEntityType => HISTORY_SUBJECT_ROUTES[entityType] !== null);

/**
 * The subject's href, or null when there is no route for its kind.
 *
 * Being linkable is necessary but not sufficient: the caller must also have
 * loaded the row, which is what proves the object still exists and belongs to
 * the reader. A linkable type with no loaded row renders the unavailable state.
 */
export function subjectHref(
  entityType: HistoryEntityType | null,
  entityId: string | null,
  locale: Locale,
): string | null {
  if (entityType === null || entityId === null) return null;
  const build = HISTORY_SUBJECT_ROUTES[entityType];
  return build === null ? null : build(locale, entityId);
}
