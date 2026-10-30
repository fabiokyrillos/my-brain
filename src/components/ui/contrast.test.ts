import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG AA, computed from the tokens rather than asserted as constants.
 *
 * The primitive layer pairs a fixed set of foreground and background tokens
 * (`ui.css`). This test parses `tokens.css` (palette) and `experience.css`
 * (tone set) for the light root and the explicit dark block and checks every
 * pairing a primitive draws: 4.5:1 for text, 3:1 for a control boundary.
 * Changing a hex in either file is what makes it fail, which is the point —
 * the first design cut had an amber that failed AA and nothing noticed.
 */
const REPO = process.cwd();
const tokens = readFileSync(join(REPO, "src/app/tokens.css"), "utf8");
const experience = readFileSync(join(REPO, "src/app/experience.css"), "utf8");

type Palette = Record<string, string>;

function blockAfter(source: string, selectorStart: string): string {
  const start = source.indexOf(selectorStart);
  if (start < 0) throw new Error(`selector not found: ${selectorStart}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unterminated block: ${selectorStart}`);
}

function hexesIn(block: string): Palette {
  const out: Palette = {};
  for (const match of block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\s*;/g)) {
    out[match[1]!] = match[2]!;
  }
  return out;
}

// `:root {` is the first block of tokens.css; the dark copy is the explicit
// attribute block, which the appearance guard already proves equals the media one.
const light: Palette = { ...hexesIn(blockAfter(tokens, ":root {")), ...hexesIn(blockAfter(experience, ":root {")) };
const dark: Palette = {
  ...light,
  ...hexesIn(blockAfter(tokens, ':root[data-theme="dark"]')),
  ...hexesIn(blockAfter(experience, ':root[data-theme="dark"]')),
};

function channel(hex: string, index: number): number {
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const value = parseInt(full.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** [foreground token, background token, minimum ratio, what draws it] */
const TEXT_PAIRS: ReadonlyArray<readonly [string, string, number, string]> = [
  ["text-primary", "background-canvas", 4.5, "page text"],
  ["text-primary", "background-surface", 4.5, "card text"],
  ["text-secondary", "background-surface", 4.5, "list meta on a card"],
  ["text-secondary", "background-canvas", 4.5, "description text"],
  ["text-muted", "background-surface", 4.5, "captions"],
  ["text-muted", "background-subtle", 4.5, "captions inside a subtle card"],
  ["action-primary-text", "action-primary", 4.5, "primary button"],
  ["accent", "accent-soft", 4.5, "accent badge"],
  ["accent-text", "accent", 3, "accent as a fill behind large text"],
  ["link", "background-surface", 4.5, "text link"],
  ["link", "background-canvas", 4.5, "text link on the page"],
  ["tone-information-fg", "tone-information-bg", 4.5, "info badge / empty state"],
  ["tone-success-fg", "tone-success-bg", 4.5, "success badge"],
  ["tone-attention-fg", "tone-attention-bg", 4.5, "warning badge"],
  ["tone-risk-fg", "tone-risk-bg", 4.5, "danger button / risk badge"],
  ["text-inverse", "background-inverse", 4.5, "inverse card"],
];

const BOUNDARY_PAIRS: ReadonlyArray<readonly [string, string, number, string]> = [
  ["control-border", "background-surface", 3, "secondary button and input border"],
  ["control-border", "background-canvas", 3, "input border on the page"],
  ["focus-ring", "background-surface", 3, "focus ring on a card"],
  ["focus-ring", "background-canvas", 3, "focus ring on the page"],
];

describe("the primitive layer's token pairs meet WCAG AA", () => {
  it("parsed both palettes", () => {
    expect(Object.keys(light).length).toBeGreaterThan(30);
    expect(light["accent"]).toBeDefined();
    expect(dark["accent"]).toBeDefined();
    expect(dark["background-canvas"]).not.toBe(light["background-canvas"]);
  });

  for (const [theme, palette] of [["light", light], ["dark", dark]] as const) {
    describe(theme, () => {
      for (const [fg, bg, min, what] of [...TEXT_PAIRS, ...BOUNDARY_PAIRS]) {
        it(`${what}: --${fg} on --${bg} ≥ ${min}:1`, () => {
          const f = palette[fg];
          const b = palette[bg];
          expect(f, `--${fg} is not a hex literal in the ${theme} palette`).toBeDefined();
          expect(b, `--${bg} is not a hex literal in the ${theme} palette`).toBeDefined();
          const ratio = contrastRatio(f!, b!);
          expect(ratio, `${f} on ${b} measures ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }
});

describe("the ratio function itself", () => {
  it("returns 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#3a6ea5", "#3a6ea5")).toBe(1);
  });
});
