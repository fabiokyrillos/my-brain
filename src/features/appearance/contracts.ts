/**
 * The appearance choice — `2O-PREF-013` … `-015`, and the first time this
 * repository reads `localStorage` at all.
 *
 * ## What ADR-114 left half-built, and what this finishes
 *
 * ADR-114 Decision 3 fixed that the theme **follows the machine, and an explicit
 * choice beats it**. The CSS for both halves shipped — `:root[data-theme="dark"]`
 * for the explicit choice and `:root:not([data-theme="light"])` inside the
 * `prefers-color-scheme: dark` block so an explicit *light* choice wins on a dark
 * machine. What never shipped was anything that writes the attribute: ADR-115
 * Decision 8 records a census over 920 files returning **no writer**, which is
 * why `OD-2O-2` exists and why this module does.
 *
 * The CSS is therefore **not touched here**. It already expresses all three
 * states correctly; this is the missing half.
 *
 * ## Three states, and `system` is the absence of the attribute
 *
 * | choice | `data-theme` | what decides |
 * | --- | --- | --- |
 * | `system` | **absent** | `prefers-color-scheme` |
 * | `light` | `"light"` | the choice, beating a dark machine |
 * | `dark` | `"dark"` | the choice, beating a light machine |
 *
 * `system` removes the attribute rather than setting some third value, because
 * the stylesheet's media block is written as `:root:not([data-theme="light"])` —
 * any attribute value other than `light` leaves the machine in charge, but only
 * *absence* also leaves `:root[data-theme="dark"]` unmatched. A `data-theme
 * ="system"` would work by accident today and break the moment someone reads the
 * attribute expecting it to name a rendered theme.
 *
 * ## `T-16`: the stored value is attacker-controlled input
 *
 * `localStorage` is writable by any script on the origin — an extension, a
 * pasted console snippet — it survives sign-out, and nothing about it is
 * authenticated. The value read from it reaches a DOM attribute **before any
 * React boundary exists**, which is the earliest and least defended moment in
 * the page's life.
 *
 * So it is validated against the closed set of three before it reaches anything,
 * and anything else becomes `system`. That is the product's standing rule —
 * every untrusted boundary is validated with an explicit parser — applied to a
 * boundary this repository has never had before.
 *
 * The framework's own guide is worth naming here, because it is the trap rather
 * than the answer: `node_modules/next/dist/docs/01-app/02-guides/
 * preventing-flash-before-hydration.md` demonstrates exactly this technique with
 * `if(t)document.documentElement.setAttribute("data-theme",t)` — **no
 * validation**, the stored string written straight onto the document. The
 * technique is right and that line is `T-16`.
 */

/**
 * The closed set, in the order the control offers it.
 *
 * `system` is first because it is the default and the state a reader arrives in,
 * not because it is a fallback — `2O-PREF-015` says an explicit choice beats the
 * machine, which presupposes the machine is what answers until then.
 */
export const appearanceChoices = ["system", "light", "dark"] as const;

export type AppearanceChoice = (typeof appearanceChoices)[number];

/**
 * Where the choice is held. Namespaced, because `localStorage` is shared by
 * everything on the origin and a bare `"theme"` is the key every third-party
 * snippet reaches for first.
 */
export const APPEARANCE_STORAGE_KEY = "my-brain.appearance";

/** The attribute the stylesheet reads. It lives on `:root`, i.e. `<html>`. */
export const APPEARANCE_ATTRIBUTE = "data-theme";

/**
 * The choices that produce an attribute — the closed set minus `system`.
 *
 * Derived rather than listed, and it exists so the inline script can express
 * *"is this a value that sets the attribute?"* without depending on the order of
 * `appearanceChoices` and without spelling `"system"` a second time inside a
 * string. An earlier version of the script asked `indexOf(v) > 0`, which is
 * correct only while `system` happens to sit at index zero — a reordering would
 * have silently started writing `data-theme="system"` onto the document.
 */
export const explicitAppearanceChoices = appearanceChoices.filter(
  (choice): choice is Exclude<AppearanceChoice, "system"> => choice !== "system",
);

/**
 * The parser. **Every** read of the stored value goes through this.
 *
 * Takes `unknown` rather than `string | null` on purpose: the callers are
 * `localStorage.getItem` (which lies about its type — a `Storage` proxy can
 * return anything) and a form control's value. Narrowing at the boundary is
 * cheaper than trusting two callers to have narrowed first.
 *
 * Anything outside the closed set becomes `system`, which is the safe outcome
 * rather than merely a convenient one: it is the state the product is in when
 * nobody has chosen, so a corrupted or hostile value degrades to "follow the
 * machine" instead of to a theme the reader did not pick.
 */
export function parseAppearanceChoice(value: unknown): AppearanceChoice {
  return (appearanceChoices as readonly unknown[]).includes(value)
    ? (value as AppearanceChoice)
    : "system";
}

/**
 * The attribute value a choice produces, or `null` to mean "remove it".
 *
 * Separated from the parser so the DOM rule has exactly one statement and both
 * the inline script and the React control obey the same one.
 */
export function appearanceAttributeValue(choice: AppearanceChoice): string | null {
  return (explicitAppearanceChoices as readonly string[]).includes(choice) ? choice : null;
}

/**
 * Apply a choice to a document element.
 *
 * Used by the control after a click. The inline script below cannot call it —
 * it runs before any module is evaluated — so the two are kept honest by
 * `appearance.test.ts`, which drives the script's own source through a DOM and
 * compares the outcome against this function for all three choices plus junk.
 */
export function applyAppearanceChoice(root: Element, choice: AppearanceChoice) {
  const value = appearanceAttributeValue(choice);
  if (value === null) root.removeAttribute(APPEARANCE_ATTRIBUTE);
  else root.setAttribute(APPEARANCE_ATTRIBUTE, value);
}

/**
 * The marker on the one `theme-color` meta this product owns — slice 2O.7.
 *
 * Everything else with that name belongs to Next's metadata system, and this
 * attribute is how the override finds its own node again instead of guessing by
 * position. `data-` rather than an id, because an id in `<head>` is a global
 * name and this is an implementation detail of one script.
 */
export const APPEARANCE_THEME_COLOR_MARKER = "data-appearance-theme-color";

/**
 * The browser chrome, made to follow the **choice** rather than the machine —
 * the residual slices 2O.3 and 2O.4 both routed to 2O.7.
 *
 * ## The divergence, stated exactly
 *
 * `viewport.themeColor` is serialised at build time into two tags:
 *
 * ```html
 * <meta name="theme-color" content="#f7f6f3" media="(prefers-color-scheme: light)" />
 * <meta name="theme-color" content="#141311" media="(prefers-color-scheme: dark)" />
 * ```
 *
 * The framework offers no other shape — `generate-viewport.md` documents these
 * two and nothing request-scoped — and it could not, because the choice lives
 * in `localStorage` and the server has never seen it. So the **canvas** obeyed
 * an explicit choice while the **status bar** kept obeying the operating
 * system: a page deliberately set to light, on a machine set to dark, painted
 * a dark bar above a light page. On an installed PWA that bar is most of what
 * the user sees of the app's frame.
 *
 * ## Why this adds a tag instead of editing Next's two
 *
 * Rewriting their `media` attributes was the shorter fix and it puts this
 * script in a tug-of-war with the framework's own metadata rendering, which
 * owns those nodes and may re-assert them. Adding one node the framework does
 * not know about avoids the contest entirely, and leaves the two originals
 * byte-identical so `system` is served by simply removing the addition.
 *
 * **First in `<head>`, because the specification says first wins.** The browser
 * uses the earliest `theme-color` meta whose `media` matches, so appending
 * would lose to the light tag on a light machine and change nothing.
 *
 * ## No colour is invented
 *
 * The content is **read off** whichever of Next's two tags names the chosen
 * scheme. There is no literal here, no second copy of the palette to drift, and
 * a change to `viewport.themeColor` propagates without touching this file. If
 * neither tag is found the function does nothing, which leaves the framework's
 * behaviour exactly as it was.
 *
 * Idempotent by construction: it reuses its own node, so running it again on an
 * appearance change — which `AppearanceControl` does — replaces a value rather
 * than accumulating tags.
 */
export function applyAppearanceThemeColor(document: Document, choice: AppearanceChoice) {
  const owned = document.querySelector(`meta[name="theme-color"][${APPEARANCE_THEME_COLOR_MARKER}]`);
  const value = appearanceAttributeValue(choice);

  if (value === null) {
    owned?.remove();
    return;
  }

  const source = document.querySelector(`meta[name="theme-color"][media*="${value}"]`);
  const color = source?.getAttribute("content");
  if (!color) return;

  const meta = owned ?? document.createElement("meta");
  meta.setAttribute("name", "theme-color");
  meta.setAttribute(APPEARANCE_THEME_COLOR_MARKER, "");
  meta.setAttribute("content", color);
  if (!owned) document.head.insertBefore(meta, document.head.firstChild);
}

/**
 * The pre-paint script, as source.
 *
 * ## Why it is a string and not a component
 *
 * It has to run **during HTML parsing**, before React exists. `useEffect` runs
 * after paint and `useLayoutEffect` after hydration; on a slow connection the
 * browser paints the server HTML long before React has loaded. Only an inline
 * script in `<head>` runs early enough — which is what the framework guide
 * concludes, and the one thing about it that is not a trap.
 *
 * ## What is interpolated, and what may never be
 *
 * The **closed set** is interpolated, via `JSON.stringify`, so the script and
 * `explicitAppearanceChoices` cannot drift into disagreeing about what is valid.
 * The **stored value never is** — `T-16` forbids it in those words, and it is
 * structurally impossible here: the script reads `localStorage` at runtime, in
 * the browser, long after this string was built at module scope. There is no
 * moment at which a stored value could be spliced into this source.
 *
 * ## Why the whole body is inside `try`
 *
 * `localStorage` throws rather than returning `null` in two ordinary cases —
 * Safari's private mode, and a browser configured to block site data. An
 * uncaught throw in a parser-blocking `<head>` script does not merely lose the
 * theme; it is the first script on the page, and the failure is silent to
 * everyone but the console. `system` is the correct outcome there anyway.
 *
 * ## No CSP change
 *
 * `next.config.ts` already carries `'unsafe-inline'` in `script-src` — read from
 * the tree, not assumed — so this needs no nonce and no header change.
 * `R-2O-27` makes a CSP change a stop condition, and `csp.test.ts` holds the
 * header shape unchanged through this slice.
 */
export const APPEARANCE_SCRIPT = `(function(){try{var c=${JSON.stringify(
  explicitAppearanceChoices,
)};var k=${JSON.stringify(APPEARANCE_STORAGE_KEY)};var a=${JSON.stringify(
  APPEARANCE_ATTRIBUTE,
)};var m=${JSON.stringify(
  APPEARANCE_THEME_COLOR_MARKER,
)};var v=window.localStorage.getItem(k);var r=document.documentElement;var o=c.indexOf(v)>=0;if(o)r.setAttribute(a,v);else r.removeAttribute(a);var s=o&&document.querySelector('meta[name="theme-color"][media*="'+v+'"]');var t=s&&s.getAttribute("content");if(t){var e=document.createElement("meta");e.setAttribute("name","theme-color");e.setAttribute(m,"");e.setAttribute("content",t);document.head.insertBefore(e,document.head.firstChild);}}catch(e){}})()`;
