/**
 * `2P-CHAT-005` — beginning a conversation from a contextual page, without
 * losing where you came from.
 *
 * ## What was missing
 *
 * Slice 2P.0 censused every link into the conversation surface and found exactly
 * one from outside its own routes: `return-to-conversation.tsx`, which goes
 * *back* to a thread that already exists. There was no way to start one about a
 * person, project, company or context while standing on that page — the owner
 * had to navigate to Conversar and retype who they meant.
 *
 * ## Why the subject travels as a handle rather than as a question
 *
 * The obvious implementation puts a ready-made sentence in the URL. That is a
 * user-content-shaped value in a query string on a shared, logged, bookmarked
 * surface, and it would be a copy of the subject's name outside the row that
 * owns it — the same defect `202608080087` had to delete when a stored citation
 * excerpt stopped tracking its source's classification.
 *
 * So the URL carries `type:id` and nothing else. The name is re-read
 * **server-side, under RLS, at render time**, which means:
 *
 * - a subject the caller does not own resolves to nothing and the banner simply
 *   does not draw (no enumeration signal, no borrowed name);
 * - a renamed or deleted subject is correct on the next view by construction,
 *   because there is no second copy to go stale;
 * - the query string holds two opaque tokens, one of them a UUID the owner
 *   already has in their address bar on the page they came from.
 *
 * ## Why the type list is closed
 *
 * An open `type` would make this a generic "read any table by name" parameter
 * reachable from a link. The four members below are the contextual pages that
 * have a name worth asking about, each resolved by an explicit query in
 * `resolve-ask-about.ts`. Adding a fifth is a deliberate edit in two places.
 */

import { z } from "zod";

import type { Locale } from "@/lib/preferences";

/** The contextual subjects a conversation can be started about. */
export const ASK_ABOUT_TYPES = ["person", "project", "organization", "context"] as const;
export type AskAboutType = (typeof ASK_ABOUT_TYPES)[number];

export type AskAboutSubject = {
  readonly type: AskAboutType;
  readonly id: string;
};

/**
 * A subject whose name has been read.
 *
 * Declared **here** rather than beside the resolver that produces it, and that
 * placement is load-bearing: `resolve-ask-about.ts` carries `import
 * "server-only"`, and a component importing the type from there pulls the guard
 * module into a client graph. It throws at import time in jsdom and at build
 * time in the browser bundle, and the error names neither the type nor the
 * component — `server-only` only knows that something reached it. So the shape
 * lives in the module with no runtime dependencies, and the resolver imports it.
 */
export type ResolvedAskAboutSubject = {
  readonly subject: AskAboutSubject;
  readonly name: string;
};

/**
 * The query parameter name. One constant, because the writer and the reader are
 * in different files and a typo would produce a link that silently does nothing.
 */
export const ASK_ABOUT_PARAM = "about";

const handleSchema = z
  .string()
  .max(80)
  .transform((raw) => raw.split(":"))
  .refine((parts) => parts.length === 2, { message: "handle must be type:id" })
  .transform((parts) => ({ type: parts[0]!, id: parts[1]! }))
  .refine((parts) => (ASK_ABOUT_TYPES as readonly string[]).includes(parts.type), {
    message: "unknown subject type",
  })
  .refine((parts) => z.string().uuid().safeParse(parts.id).success, {
    message: "subject id must be a uuid",
  })
  .transform((parts): AskAboutSubject => ({ type: parts.type as AskAboutType, id: parts.id }));

/** `type:id`, the only shape that travels. */
export function serializeAskAbout(subject: AskAboutSubject): string {
  return `${subject.type}:${subject.id}`;
}

/**
 * Reads a handle off a query value, or returns null.
 *
 * Returns null rather than throwing for every malformed input, including the
 * array form Next hands over when a parameter is repeated. A bad handle is a
 * link somebody edited; the honest response is to render the page without the
 * banner, not to fail the page.
 */
export function parseAskAbout(value: string | string[] | undefined): AskAboutSubject | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw === "") return null;
  const parsed = handleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Where the affordance points. */
export function askAboutHref(locale: Locale, subject: AskAboutSubject): string {
  return `/${locale}/app/chat?${ASK_ABOUT_PARAM}=${encodeURIComponent(serializeAskAbout(subject))}`;
}

/** The route a resolved subject came from, for the way back. */
const SUBJECT_ROUTE: Readonly<Record<AskAboutType, string>> = {
  person: "people",
  project: "projects",
  organization: "organizations",
  context: "contexts",
};

export function askAboutSourceHref(locale: Locale, subject: AskAboutSubject): string {
  return `/${locale}/app/${SUBJECT_ROUTE[subject.type]}/${subject.id}`;
}

type AskAboutCopy = {
  /** The affordance on the contextual page. */
  readonly action: string;
  /** The banner heading on the conversation surface. */
  readonly asking: (name: string) => string;
  /** The way back. */
  readonly back: (name: string) => string;
  /**
   * The sentence the composer is seeded with.
   *
   * A *starting point the owner edits*, never a submission: seeding a field is
   * not sending it, and `2P-CAPTURE-008`'s rule that only an explicit send
   * creates anything is the same rule here. The composer's own `required`
   * attribute and the action's empty-text refusal both still apply.
   */
  readonly seed: (name: string) => string;
};

export const ASK_ABOUT_COPY = {
  "pt-BR": {
    action: "Perguntar sobre isto",
    asking: (name: string) => `Perguntando sobre ${name}`,
    back: (name: string) => `Voltar para ${name}`,
    seed: (name: string) => `O que eu registrei sobre ${name}?`,
  },
  en: {
    action: "Ask about this",
    asking: (name: string) => `Asking about ${name}`,
    back: (name: string) => `Back to ${name}`,
    seed: (name: string) => `What have I recorded about ${name}?`,
  },
} satisfies Record<Locale, AskAboutCopy>;

export function askAboutCopy(locale: Locale): AskAboutCopy {
  return ASK_ABOUT_COPY[locale];
}
