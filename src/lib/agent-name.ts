/**
 * Substitutes the assistant's configured name into a copy record (UX-06, DEC-2).
 *
 * ## Why a token rather than a function per string
 *
 * The repo's copy modules are typed records, and the actor's name appears in
 * strings nested several levels down — `attention.review_interpretation
 * .description`, `provenance.origins.brain`, and so on. Turning each of those
 * into `(agent: string) => string` would push the parameter through every
 * intermediate type for the sake of one word, and would leave the record no
 * longer readable as the block of copy it is.
 *
 * So the copy keeps the shape it had and carries `{agent}` where the name goes,
 * and the module's own getter substitutes once on the way out. The getter takes
 * the name as a **required** argument, which is what makes this safe: the
 * compiler finds every call site, so a surface cannot quietly keep rendering a
 * hardcoded name.
 *
 * `agent-name.test.ts` closes the remaining gap — that a token could be left
 * behind — by asserting no `{agent}` survives in any getter's output.
 *
 * ## What it does not touch
 *
 * Functions pass through by reference. Several copy entries are already
 * `(count: number) => string`, and re-wrapping them would break identity for no
 * gain; a function that needs the name should close over it at the call site.
 */

const AGENT_TOKEN = /\{agent\}/g;

export const AGENT_NAME_TOKEN = "{agent}";

function substitute(value: unknown, agentName: string): unknown {
  if (typeof value === "string") return value.replace(AGENT_TOKEN, agentName);
  if (Array.isArray(value)) return value.map((item) => substitute(item, agentName));
  // `typeof null === "object"`, and a function must survive by reference.
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, nested]) => [key, substitute(nested, agentName)] as const);
  return Object.fromEntries(entries);
}

/**
 * Returns `copy` with every `{agent}` replaced by `agentName`.
 *
 * The return type is the input type: substitution replaces strings with strings
 * and preserves every key, so the shape a caller destructures is unchanged.
 */
export function withAgentName<T>(copy: T, agentName: string): T {
  return substitute(copy, agentName) as T;
}
