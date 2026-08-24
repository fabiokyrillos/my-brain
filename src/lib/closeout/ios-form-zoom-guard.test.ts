import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * iOS zooms into any form control smaller than 16px, and the whole product had
 * that shape — slice 2R.3's owner device checkpoint.
 *
 * ## What was reported, and what it actually was
 *
 * *"Ao tocar num campo para escrever no PWA, o iPhone aplica zoom e o modal fica
 * visualmente quebrado. Preciso reduzir manualmente o zoom para continuar."*
 *
 * Safari on iOS auto-zooms when a focused `input`, `textarea` or `select`
 * computes to **less than 16px**, and it does not zoom back out afterwards. The
 * page is then wider than the screen, so a centred dialog is half off it and the
 * primary action is unreachable — which is the "quebrado" in the report rather
 * than a layout bug of its own.
 *
 * This product's body token is **13.5px**. A census at the time of the checkpoint
 * found **nineteen field rules across ten stylesheets** below the threshold, so
 * it was never the reminder composer: every text field in the product did it.
 *
 * **And it was already known, twice.** `globals.css` carried an explicit
 * `font-size: 16px` immediately after `font: var(--type-body)` on `.auth-form
 * input` and on `.settings-fields input` — two surfaces where somebody met the
 * bug and fixed it locally. Nothing generalised it and nothing guarded it, so
 * every field added afterwards reintroduced it. **That is the shape this file
 * exists to stop: a fix that works and does not spread.**
 *
 * ## Why the census asserts non-empty rather than empty
 *
 * The obvious guard demands every field rule reach 16px, and that would be a
 * redesign — nineteen surfaces' typography changed to satisfy a platform rule
 * that only applies on touch. The checkpoint asked for the opposite: *desktop
 * permanece inalterado.*
 *
 * So the fix is **one floor**, applied where the platform cares, and the
 * assertions split accordingly: the census proves the population still exists
 * (so the guard is not protecting nothing), one case proves the floor covers it,
 * and one case proves nothing can outrank the floor. Together those are the
 * whole of "the effective size on iOS is 16px", which is the property, rather
 * than "every declaration says 16px", which is a means.
 *
 * ## What it deliberately does not check
 *
 * Checkboxes, radios, ranges and file inputs. iOS does not zoom for them because
 * they have no text to enter, and demanding 16px there would change controls
 * that are sized by their own box rather than by their font.
 */

const REPO = join(__dirname, "..", "..", "..");
const APP_CSS = join(REPO, "src/app");
const read = (file: string) => readFileSync(join(APP_CSS, file), "utf8");

/** The threshold Safari applies. Not a preference — the platform's number. */
const IOS_ZOOM_FLOOR = 16;

/** Field elements that accept typed text, which are the ones iOS zooms for. */
const TEXT_FIELD = /(input|textarea|select)(?!\w)/i;
const NOT_A_TEXT_FIELD = /checkbox|radio|\[type="?(checkbox|radio|hidden|range|file|submit|button)"?\]/i;

/** `--type-*` tokens, resolved to their pixel size from the token sheet. */
function tokenSizes(): ReadonlyMap<string, number> {
  const sizes = new Map<string, number>();
  for (const match of read("tokens.css").matchAll(/(--type-[a-z0-9-]+):\s*[^;]*?([0-9.]+)px/g)) {
    sizes.set(match[1]!, Number.parseFloat(match[2]!));
  }
  return sizes;
}

/**
 * Comments removed before anything is matched.
 *
 * Not tidiness: a `/* … *\/` block sitting above a rule is part of the text
 * before its `{`, so a comment that happens to mention *input* would make an
 * unrelated rule look like a field rule. Several in this repository do — the
 * reminders sheet explains a `<select>`'s label two rules above one — and the
 * first version of this census reported them.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

type FieldRule = { readonly file: string; readonly selector: string; readonly px: number };

/**
 * Every rule that targets a text field and declares a font size, with that size
 * resolved through the token sheet.
 *
 * A deliberately crude brace-matcher: these stylesheets have no nested
 * at-rules inside declaration blocks, and a real parser would be a dependency
 * for a census that reads ten files.
 */
function fieldRulesBelowFloor(): readonly FieldRule[] {
  const tokens = tokenSizes();
  const found: FieldRule[] = [];

  for (const file of readdirSync(APP_CSS).filter((name) => name.endsWith(".css"))) {
    const css = stripComments(read(file));
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1]!.trim().replace(/\s+/g, " ");
      const body = rule[2]!;
      if (!TEXT_FIELD.test(selector) || NOT_A_TEXT_FIELD.test(selector)) continue;

      /*
        The LAST font declaration in the block wins, which is the whole reason
        the two existing local fixes work: they put `font-size: 16px` after the
        `font:` shorthand. Reading the first would report them as defects.
      */
      const declarations = [...body.matchAll(/(?:^|;)\s*(font|font-size)\s*:\s*([^;]+)/g)];
      if (declarations.length === 0) continue;
      const value = declarations[declarations.length - 1]![2]!.trim();

      const token = /var\((--type-[a-z0-9-]+)/.exec(value);
      const px = token
        ? tokens.get(token[1]!) ?? null
        : (() => {
          const literal = /([0-9.]+)px/.exec(value);
          return literal ? Number.parseFloat(literal[1]!) : null;
        })();

      if (px !== null && px < IOS_ZOOM_FLOOR) found.push({ file, selector, px });
    }
  }
  return found;
}

describe("iOS does not zoom into a field on focus", () => {
  it("still has a body token below the floor, so this guard is not moot", () => {
    // If `--type-body` ever rises to 16px the whole class of defect disappears
    // and so does the reason for the floor. Asserted so the guard reports that
    // rather than quietly protecting nothing.
    const body = tokenSizes().get("--type-body");
    expect(body, "the token sheet stopped declaring --type-body").toBeGreaterThan(0);
    expect(body!, "--type-body is now above the floor").toBeLessThan(IOS_ZOOM_FLOOR);
  });

  it("finds the field rules that are below it, so the census is not vacuous", () => {
    /*
      The population the floor exists to cover.

      Asserted **non-empty** rather than empty, and that is the honest direction:
      the fix does not rewrite nineteen rules, it overrides them at the one width
      where the platform cares. A census that had to reach zero would mean
      touching every surface's typography, which is a redesign the checkpoint did
      not ask for.
    */
    const below = fieldRulesBelowFloor();
    expect(below.length, "the census matcher stopped finding field rules").toBeGreaterThan(5);
  });

  it("covers them with ONE floor, at the width the platform cares about", () => {
    /*
      THE FIX THE CHECKPOINT PRODUCED, asserted where it lives.

      `!important` and not a specificity trick. The rules it must beat reach
      `(0,2,1)` — `.reminder-panel input[type="text"]` — so winning by
      specificity would take `:root:root:root input`, which reads like a typo and
      would be "tidied" by the next person through. Declaring that the platform
      floor outranks every design size is what `!important` says, and here that
      is exactly true.

      It is also what makes "the declaration exists" a sufficient check: nothing
      but another `!important` can override it, and the case below forbids that.

      Scoped to coarse pointers and narrow viewports, so the desktop type scale
      is untouched — the checkpoint asked for that in terms.
    */
    const css = read("globals.css");
    expect(css, "the shared field floor is gone").toContain("--field-font-size-min");

    // `[\s\S]` rather than the `s` flag: this project's TypeScript target
    // predates it, and `tsc` refuses the flag outright.
    const floor = /@media[^{]*(pointer:\s*coarse|max-width)[^{]*\{[\s\S]*?(input|textarea|select)[^{}]*\{[^}]*font-size:[^;]*var\(--field-font-size-min\)[^;]*!important/;
    expect(floor.test(css), "the floor is not applied to fields inside a touch/narrow query")
      .toBe(true);

    // And the token it reads is actually at the platform's number.
    const declared = /--field-font-size-min:\s*([0-9.]+)px/.exec(css);
    expect(declared, "--field-font-size-min is not declared with a px value").not.toBeNull();
    expect(Number.parseFloat(declared![1]!)).toBeGreaterThanOrEqual(IOS_ZOOM_FLOOR);
  });

  it("lets nothing else win with `!important` at a smaller size", () => {
    /*
      The one way the floor can be defeated. A later `!important` font-size on a
      field would beat it silently, and the symptom — zoom on focus — looks
      nothing like a CSS precedence question when it reaches the owner.
    */
    const offenders: string[] = [];
    for (const file of readdirSync(APP_CSS).filter((name) => name.endsWith(".css"))) {
      const css = stripComments(read(file));
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = rule[1]!.trim().replace(/\s+/g, " ");
        if (!TEXT_FIELD.test(selector) || NOT_A_TEXT_FIELD.test(selector)) continue;
        for (const match of rule[2]!.matchAll(/font-size:\s*([^;]+!important)/g)) {
          const value = match[1]!;
          if (value.includes("--field-font-size-min")) continue;
          const px = /([0-9.]+)px/.exec(value);
          if (px && Number.parseFloat(px[1]!) < IOS_ZOOM_FLOOR) {
            offenders.push(`${file} :: ${selector}`);
          }
        }
      }
    }
    expect(offenders, "these override the iOS floor with a smaller size").toEqual([]);
  });
});

describe("a dialog is measured against the viewport the phone actually shows", () => {
  /**
   * `100vh` on iOS is the viewport **with the URL bar hidden**, so a dialog
   * bounded by it can be taller than what is on screen — and taller still once
   * the keyboard is up, which is precisely when the owner reported the primary
   * action being unreachable.
   *
   * `dvh` is the dynamic viewport unit that follows the chrome. It is declared
   * **after** a `vh` value so the older unit is the fallback rather than the
   * winner: a browser that does not know `dvh` discards that declaration and
   * keeps the one before it.
   */
  it("bounds the shared dialog with a dynamic viewport unit, with a fallback before it", () => {
    const css = read("task-commands.css");
    const dialog = css.slice(css.indexOf(".task-command-dialog {"));
    const block = dialog.slice(0, dialog.indexOf("}"));

    expect(block, "the dialog lost its fallback height bound").toMatch(/max-height:[^;]*vh/);
    expect(block, "the dialog is bounded by `vh`, which iOS measures wrong")
      .toMatch(/max-height:[^;]*dvh/);

    const fallbackAt = block.search(/max-height:[^;]*\bvh\b/);
    const dynamicAt = block.search(/max-height:[^;]*dvh/);
    expect(
      dynamicAt,
      "the dynamic unit must come AFTER the fallback or the fallback wins",
    ).toBeGreaterThan(fallbackAt);
  });

  it("keeps the mobile sheet on a dynamic unit too", () => {
    const css = read("task-commands.css");
    const mobile = css.slice(css.indexOf("@media (max-width: 640px)"));
    expect(mobile).toMatch(/max-height:[^;]*dvh/);
  });
});
