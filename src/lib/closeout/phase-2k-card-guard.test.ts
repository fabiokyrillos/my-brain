/**
 * `2K-CARD-002`, `2K-CARD-005`, `2K-CARD-008`, `2K-PRIVACY-001` — the
 * structural half of slice 2K.1.
 *
 * The rendering tests in `src/features/conversation-cards` prove what the
 * components *do*. This proves what nothing in the feature *is allowed to
 * become*: a second place the confirmation requirement is decided, a read-only
 * card that grew a form, or a surface that reasons about sensitivity on its
 * own.
 *
 * Every detector below is executed against a planted violation, because a
 * guard whose failure mode is unasserted is a guard nobody has run.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const FEATURE = join("src", "features", "conversation-cards");

const read = (path: string) => readFileSync(join(REPO, path), "utf8");
/** Comments are prose about the rule; only code can break it. */
const code = (path: string) =>
  read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function featureFiles(): string[] {
  const root = join(REPO, FEATURE);
  const found: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) continue;
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    found.push(relative(REPO, full).replace(/\\/g, "/"));
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * The detectors, named so the mutation tests below can execute them.
 * ------------------------------------------------------------------ */

/** A control that posts. `action=`/`formAction=` is how a card would mutate. */
const MUTATING_CONTROL = /<form\b|formAction|useActionState|type="submit"|action=\{/;

/**
 * Re-deriving the card state from something other than `card.state`.
 *
 * `console-state.ts:20-28` states the rule for task commands; `2K-CARD-002`
 * extends it. A component reading `preview.disposition` — or any sibling field
 * — to decide what to draw is the second decision site the rule forbids.
 */
const RE_DERIVED_STATE = /\.disposition\b|\.willMutate\b|preview\.[a-z]/i;

describe("2K.1: the guard scans a feature that exists", () => {
  it("finds the modules it claims to police", () => {
    // Every absence assertion below iterates `featureFiles()`. An empty list
    // would make all of them pass while proving nothing — the vacuous-guard
    // failure this repository has recorded more than once.
    const files = featureFiles();
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const required of ["contracts.ts", "copy.ts", "card.tsx", "read-only-preview.tsx"]) {
      expect(files, `${required} missing`).toContain(`${FEATURE.replace(/\\/g, "/")}/${required}`);
    }
  });
});

describe("2K-CARD-008: no mutating control is reachable from a read-only card type", () => {
  it("finds no posting control in the read-only preview", () => {
    expect(MUTATING_CONTROL.test(code(`${FEATURE}/read-only-preview.tsx`))).toBe(false);
  });

  it("gates every passed-in control on the type's declared mutability", () => {
    // The shared shell may render controls, but only for a type that may have
    // them — so a caller cannot smuggle one onto a read-only card.
    expect(code(`${FEATURE}/card.tsx`)).toMatch(/mayRenderMutatingControl\(/);
  });

  it("fires on a planted violation, so the absence above means something", () => {
    for (const planted of [
      '<form action={applyAction}>',
      '<button formAction={confirm} type="submit">Aplicar</button>',
      "const [state, act] = useActionState(apply, idle);",
    ]) {
      expect(MUTATING_CONTROL.test(planted), planted).toBe(true);
    }
    expect(MUTATING_CONTROL.test('<Link href={card.href}>{copy.open}</Link>')).toBe(false);
  });
});

describe("2K-CARD-002: no component in the feature re-derives the state", () => {
  it("finds no component reading a preview field to decide what to draw", () => {
    const offenders = featureFiles().filter((file) => RE_DERIVED_STATE.test(code(file)));
    expect(offenders).toEqual([]);
  });

  it("fires on a planted violation", () => {
    for (const planted of [
      'if (props.preview.disposition === "refused") return null;',
      "const mutable = props.preview.willMutate;",
    ]) {
      expect(RE_DERIVED_STATE.test(planted), planted).toBe(true);
    }
    expect(RE_DERIVED_STATE.test("switch (card.state) { case \"expired\":")).toBe(false);
  });
});

describe("2K-CARD-005: the task pipeline keeps its single implementation", () => {
  it("builds no task preview, fingerprint or confirmation inside the card feature", () => {
    for (const file of featureFiles()) {
      expect(code(file), file).not.toMatch(
        /buildTaskCommandPreview|deriveTaskCommand|issue_task_command_confirmation|requestFingerprint/,
      );
    }
  });

  it("keeps the composer rendering the console's own task renderer", () => {
    // If this ever stops being true, the composer has started re-modelling
    // command states — the failure `composer-state.ts:9-15` warns about.
    expect(code("src/features/assistant/assistant-composer.tsx")).toMatch(/<TaskCommandResult/);
  });
});

describe("2K-PRIVACY-001: the card feature reads the central contract for `chat`", () => {
  it("consumes `resolveContent(\"chat\", …)` rather than deciding for itself", () => {
    expect(code(`${FEATURE}/card.tsx`)).toMatch(/resolveContent\(\s*\n?\s*"chat"/);
  });

  it("declares `chat` a governed surface", () => {
    const contract = read("src/features/sensitivity/contracts.ts");
    const governed = contract.match(/export const GOVERNED_SURFACES = \[[\s\S]*?\] as const;/)?.[0] ?? "";
    expect(governed, "GOVERNED_SURFACES not found").not.toBe("");
    expect(governed).toContain('"chat"');
  });

  it("keeps `search` out of the governed list, so ADR-093 stays closed", () => {
    // `2K-PRIVACY-006`. Chat's policy is a new decision; search's is signed.
    const contract = read("src/features/sensitivity/contracts.ts");
    const governed = contract.match(/export const GOVERNED_SURFACES = \[[\s\S]*?\] as const;/)?.[0] ?? "";
    expect(governed).not.toContain('"search"');
  });

  it("names no literal sensitivity level anywhere in the feature", () => {
    for (const file of featureFiles()) {
      expect(code(file), file).not.toMatch(/["'`]highly_sensitive["'`]\s*[!=]==?|[!=]==?\s*["'`]highly_sensitive/);
    }
  });
});

describe("2K.1 boundary: the card feature reaches no privileged client and no later slice", () => {
  it("constructs no service-role client", () => {
    for (const file of featureFiles()) {
      expect(code(file), file).not.toMatch(/service_role|SERVICE_ROLE|createServiceClient/);
    }
  });

  it("carries no continuity payload and no suggestion derivation yet", () => {
    // 2K.3 and 2K.6 own those. Asserted so this slice cannot quietly anticipate
    // them and then claim their requirements at close.
    for (const file of featureFiles()) {
      expect(code(file), file).not.toMatch(/issuedAt|observedBefore|operationKey|suggestion/i);
    }
  });
});
