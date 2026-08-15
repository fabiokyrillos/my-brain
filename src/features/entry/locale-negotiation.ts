import type { Locale } from "@/lib/preferences";

/**
 * `2O-ENTRY-001` — which language a stranger's first frame is in.
 *
 * Until this phase, `src/app/page.tsx` redirected every visitor to
 * `/pt-BR/app` unconditionally, so a browser that asked for English got a
 * Portuguese login form for a product it had never been told the name of. The
 * requirement is precise about the fix: **`pt-BR` is the fallback, not the
 * answer.**
 *
 * ## Why this is hand-written rather than a dependency
 *
 * Two locales, one header. `@formatjs/intl-localematcher` and `negotiator` —
 * the pair the Next.js internationalization guide suggests — are the right tools
 * for a real matrix of languages and regions, and here they would be two
 * dependencies to resolve `pt` or `en`. ADR-036 already removed a whole i18n
 * library from this repository for having zero imports; adding two to answer a
 * binary question would be the same mistake in the other direction.
 *
 * ## The header is untrusted input
 *
 * `Accept-Language` is supplied by the caller and reaches a **public,
 * unauthenticated** page, so every branch below is total: a malformed quality,
 * a 5,000-character token, an empty string and a missing header all return a
 * locale rather than throwing. A parser that throws here turns the product's
 * front door into a 500 for whoever sends a bad string.
 *
 * The return type is the closed `Locale` union, so nothing this function
 * produces can reach a route segment or a `lang` attribute unvalidated.
 */

/** The language subtags this product understands, in the order they are tried. */
const UNDERSTOOD: readonly { readonly subtag: string; readonly locale: Locale }[] = [
  { subtag: "pt", locale: "pt-BR" },
  { subtag: "en", locale: "en" },
];

const FALLBACK: Locale = "pt-BR";

type Ranked = { readonly locale: Locale; readonly quality: number; readonly position: number };

/**
 * Parses one `language-range [;q=value]` entry.
 *
 * Returns `null` for anything not understood, including `q=0` — which is the
 * client saying *"not this one"* rather than *"no preference"*, and treating it
 * as a weak yes would serve a language the visitor explicitly refused.
 */
function rank(entry: string, position: number): Ranked | null {
  const [rangePart, ...parameters] = entry.split(";");
  const range = rangePart.trim().toLowerCase();
  if (!range || range === "*") return null;

  // `pt-BR` matches the `pt` subtag; `ptx` does not. Splitting on `-` is what
  // makes that true — a `startsWith` test would accept `ptx` and `enm`.
  const primary = range.split("-")[0];
  const understood = UNDERSTOOD.find((candidate) => candidate.subtag === primary);
  if (!understood) return null;

  let quality = 1;
  for (const parameter of parameters) {
    const [name, value] = parameter.split("=");
    if (name?.trim().toLowerCase() !== "q") continue;
    const parsed = Number(value);
    // A malformed or out-of-range quality is discarded rather than believed.
    // `q` is defined on [0, 1]; `NaN` and `1.5` are both a client getting it
    // wrong, and neither should outrank a well-formed entry.
    quality = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 1;
  }

  if (quality === 0) return null;
  return { locale: understood.locale, quality, position };
}

export function negotiateEntryLocale(header: string | null | undefined): Locale {
  if (!header) return FALLBACK;

  const ranked = header
    .split(",")
    .map((entry, position) => rank(entry, position))
    .filter((candidate): candidate is Ranked => candidate !== null);

  if (ranked.length === 0) return FALLBACK;

  // Highest quality wins; a tie is broken by the order the client wrote them,
  // which is the only signal left and is what the client meant by writing one
  // first.
  return ranked.reduce((best, candidate) =>
    candidate.quality > best.quality
      || (candidate.quality === best.quality && candidate.position < best.position)
      ? candidate
      : best,
  ).locale;
}
