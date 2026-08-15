/**
 * `2J-ACCESS-001`'s honesty guard.
 *
 * `e2e/accessibility.spec.ts` cannot navigate to the palette, search or Library:
 * those routes are behind `src/proxy.ts` and CI has no Supabase session. So it
 * mirrors their DOM, exactly as `e2e/layout-contracts.spec.ts` has done since
 * Slice A — and inherits that approach's one real cost: **a mirror can drift.**
 *
 * A drifted mirror is worse than no lane at all. It reports green about markup
 * the product no longer emits, which is the "harness that tests a different
 * artifact" failure this repository has now recorded seven times.
 *
 * This guard bounds that cost by re-deriving every load-bearing attribute from
 * the **component source** on each run. It deliberately does not compare whole
 * strings — that would fail on every cosmetic edit and be disabled within a
 * month. It pins the attributes the accessibility assertions actually depend
 * on, so dropping `aria-modal` from the palette breaks this test rather than
 * silently invalidating a passing lane.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const PALETTE = "src/features/palette/command-palette.tsx";
const SEARCH = "src/features/search/search-surface.tsx";
const LIBRARY = "src/app/[locale]/app/library/page.tsx";
const LENS_STRIP = "src/features/library/brain-lenses.tsx";
const CARD = "src/features/conversation-cards/card.tsx";
const READ_ONLY = "src/features/conversation-cards/read-only-preview.tsx";
const CARD_CONTRACT = "src/features/conversation-cards/contracts.ts";
const CARD_COPY = "src/features/conversation-cards/copy.ts";
const MIRROR = "e2e/accessibility.spec.ts";

describe("2J-ACCESS-001: the accessibility mirror tracks the components it claims to represent", () => {
  const mirror = read(MIRROR);

  it("pins the palette's dialog semantics to the component's own", () => {
    const palette = read(PALETTE);
    // Each of these is asserted by the lane. If the component stops emitting
    // one, the lane would keep passing against markup that no longer exists.
    for (const attribute of [
      'role="dialog"',
      'aria-modal="true"',
      'role="combobox"',
      'aria-autocomplete="list"',
      'role="listbox"',
      'role="option"',
      'aria-live="polite"',
    ]) {
      const inSource = palette.includes(attribute) || palette.includes(attribute.replace(/"/g, "{\""));
      expect(inSource, `${PALETTE} no longer emits ${attribute}`).toBe(true);
      expect(mirror.includes(attribute), `${MIRROR} no longer mirrors ${attribute}`).toBe(true);
    }
  });

  it("pins the palette's focusable class names, which the tab-order assertion walks", () => {
    const palette = read(PALETTE);
    for (const className of ["palette-trigger", "palette-input", "palette-close", "palette-option"]) {
      expect(palette, `${PALETTE} no longer uses .${className}`).toContain(className);
      expect(mirror, `${MIRROR} no longer mirrors .${className}`).toContain(className);
    }
  });

  it("pins search's landmark and its labelled controls", () => {
    const search = read(SEARCH);
    for (const token of ['role="search"', "search-input", "search-sensitive", 'aria-live="polite"']) {
      expect(search, `${SEARCH} no longer emits ${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
    // Every `<label>` in the real surface resolves to a control. The mirror is
    // only useful if it carries the same property, so both are checked.
    expect(search).toContain("htmlFor");
    expect(mirror).toContain("for=");
  });

  it("pins Brain's panel structure, which the touch-target assertion measures", () => {
    const library = read(LIBRARY);
    for (const className of ["brain-domains", "brain-domain", "brain-domain-head", "brain-recent"]) {
      expect(library, `${LIBRARY} no longer uses .${className}`).toContain(className);
      expect(mirror, `${MIRROR} no longer mirrors .${className}`).toContain(className);
    }
  });

  /**
   * The lens strip, pinned separately from the overview that shares a file with
   * nothing.
   *
   * It renders on **nine** surfaces, so a target below 44px here is a target
   * below 44px on nine pages — and it is the one component in Brain that no
   * page owns, which is exactly the shape whose fixture goes stale unnoticed.
   * The `Biblioteca` heading this lane carried for two commits after the
   * destination was renamed is the same failure, one file over.
   */
  it("pins the Brain lens strip, which nine surfaces mount", () => {
    const strip = read(LENS_STRIP);
    for (const token of ["brain-lenses", "brain-lens", 'aria-current={lens === active ? "page"']) {
      expect(strip, `${LENS_STRIP} no longer emits ${token}`).toContain(token);
    }
    for (const token of ["brain-lenses", "brain-lens", 'aria-current="page"']) {
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
  });

  it("pins the Conversar card's class names and state attribute (2K-A11Y-001)", () => {
    const card = read(CARD);
    const readOnly = read(READ_ONLY);
    for (const token of [
      "conversation-card",
      "conversation-card-head",
      "conversation-card-type",
      "conversation-card-state",
      "conversation-card-masked",
      "conversation-card-reveal",
      "data-state",
    ]) {
      expect(card, `${CARD} no longer emits ${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
    for (const token of ["conversation-card-readonly", "conversation-card-open"]) {
      expect(readOnly, `${READ_ONLY} no longer emits ${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
    // The mask carries `aria-expanded`, which is what makes the reveal a
    // disclosure rather than an unlabelled toggle.
    expect(card).toContain("aria-expanded");
    expect(mirror).toContain("aria-expanded");
  });

  it("mirrors every card state, so a new one cannot arrive unscanned", () => {
    // The fixture enumerates states by hand. If the vocabulary grows and the
    // fixture does not, the lane would report green over a state it never
    // rendered — the drift this guard exists to catch.
    const contract = read(CARD_CONTRACT);
    const declared = contract
      .slice(contract.indexOf("export const CONVERSATION_CARD_STATES = ["))
      .slice(0, contract.slice(contract.indexOf("export const CONVERSATION_CARD_STATES = [")).indexOf("] as const;"));
    const states = [...declared.matchAll(/^\s*"([a-z_]+)",/gm)].map((match) => match[1]);
    expect(states.length).toBeGreaterThanOrEqual(10);
    for (const state of states) {
      expect(mirror, `${MIRROR} does not render the ${state} card`).toContain(`"${state}", "`);
    }
  });

  it("mirrors the card's real pt-BR copy rather than invented labels", () => {
    const copy = read(CARD_COPY);
    for (const sentence of ["Encontrei isto", "Conteúdo sensível, guardado.", "Mostrar mesmo assim", "Abrir"]) {
      expect(copy, `${CARD_COPY} no longer contains "${sentence}"`).toContain(sentence);
      expect(mirror, `${MIRROR} no longer mirrors "${sentence}"`).toContain(sentence);
    }
  });

  it("loads the card stylesheet, without which the target-size assertion is meaningless", () => {
    expect(mirror).toContain('"conversation-cards.css"');
    expect(read("src/app/globals.css")).toContain('@import "./conversation-cards.css";');
  });

  it("pins the 2K.2 controls to the components that emit them", () => {
    const consoleSource = read("src/features/task-commands/command-console.tsx");
    const proposal = read("src/features/memories/memory-proposal-card.tsx");
    for (const token of ["task-command-edit", "task-command-discard", "task-command-edit-value"]) {
      expect(consoleSource, `command-console.tsx no longer emits .${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors .${token}`).toContain(token);
    }
    for (const token of ["memory-proposal-undo", "memory-proposal-undo-note"]) {
      expect(proposal, `memory-proposal-card.tsx no longer emits .${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors .${token}`).toContain(token);
    }
    // The two intents the controls submit. A control that stopped naming its
    // intent would post `ask` and be silently misrouted.
    for (const intent of ['value="edit"', 'value="discard"']) {
      expect(consoleSource, `command-console.tsx no longer submits ${intent}`).toContain(intent);
      expect(mirror, `${MIRROR} no longer mirrors ${intent}`).toContain(intent);
    }
  });

  it("pins the 2K.3 return path to the components that emit it", () => {
    const resumed = read("src/features/conversation-cards/resumed-card.tsx");
    const returnLink = read("src/features/conversation-cards/return-to-conversation.tsx");
    const thread = read("src/app/[locale]/app/chat/[conversationId]/page.tsx");

    for (const token of ["conversation-resumed", "conversation-resumed-note", "conversation-resumed-anchor"]) {
      expect(resumed, `resumed-card.tsx no longer emits .${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors .${token}`).toContain(token);
    }
    expect(returnLink, "return-to-conversation.tsx no longer emits .conversation-return")
      .toContain("conversation-return");
    expect(mirror).toContain("conversation-return");

    // The resumption takes focus once, so it must be a focusable named region.
    // The lane's fixture would otherwise scan a plain div and report nothing.
    for (const attribute of ['role="region"', "tabIndex={-1}"]) {
      expect(resumed, `resumed-card.tsx no longer emits ${attribute}`).toContain(attribute);
    }
    expect(mirror).toContain('role="region"');
    expect(mirror).toContain('tabindex="-1"');

    // The anchor the fixture links to is the one the thread paints.
    expect(thread).toContain("messageAnchorId(messageId)");
    expect(mirror).toContain('id="message-1"');
  });

  it("pins the 2K.4 source block, including both evidence branches", () => {
    const list = read("src/features/conversation-sources/source-list.tsx");
    for (const token of [
      "conversation-sources",
      "conversation-sources-title",
      "conversation-sources-list",
      "conversation-source-support",
      "conversation-source-freshness",
      "conversation-sources-insufficient",
      "conversation-sources-reach",
      "data-evidence",
    ]) {
      expect(list, `source-list.tsx no longer emits ${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
    /*
     * Both branches, and this is the assertion that matters. The requirement is
     * that an evidenced answer and one that found nothing be **visually
     * distinct**; a lane scanning only one of them would never see the
     * difference it exists to protect.
     */
    expect(mirror).toContain('data-evidence="evidenced"');
    expect(mirror).toContain('data-evidence="insufficient"');
    // Freshness renders a machine-readable instant, not only a formatted date.
    expect(list).toContain("dateTime={occurredAt}");
    expect(mirror).toContain("<time datetime=");
  });

  it("pins the 2K.5 disclosure panel, and scans it open", () => {
    const panel = read("src/features/conversation-sources/explanation-panel.tsx");
    for (const token of [
      "conversation-explanation",
      "conversation-explanation-body",
      "conversation-explanation-correct-title",
      "conversation-explanation-no-effect",
    ]) {
      expect(panel, `explanation-panel.tsx no longer emits .${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors .${token}`).toContain(token);
    }
    expect(panel).toContain("<details");
    expect(panel).toContain("<summary>");
    /*
     * The fixture renders it **open** while the product ships it closed. axe
     * cannot scan what is not in the accessibility tree, so a lane that only
     * ever saw the summary would report green over a body it never looked at.
     * Asserted so the discrepancy stays deliberate rather than becoming drift.
     */
    expect(mirror).toContain('class="conversation-explanation" open');
    expect(panel, "the product must still ship it closed").not.toMatch(/<details[^>]*\sopen/);
  });

  it("pins the 2K.6 suggestion row, including the control it does not have", () => {
    const row = read("src/features/conversation-cards/suggestion-row.tsx");
    for (const token of [
      "conversation-suggestions",
      "conversation-suggestions-label",
      "conversation-suggestions-list",
      "data-category",
    ]) {
      expect(row, `suggestion-row.tsx no longer emits ${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
    /*
     * The absence is part of the mirror. A suggestion says what the user could
     * type; a button would ask on their behalf. If the component ever grew one,
     * the fixture would silently stop representing it — so both are asserted.
     */
    expect(row).not.toMatch(/<button\b|<form\b|onClick/);
    /*
     * Bounded to *this* builder rather than to everything before `SURFACES`.
     * The first draft sliced to the declaration and passed only because
     * `conversationSuggestions` happened to be last; slice 2L.1 added two
     * builders after it and the assertion started reading their markup. A
     * fixture check that widens whenever a fixture is appended is a check that
     * fails for a reason unrelated to what it is about.
     */
    const start = mirror.indexOf("function conversationSuggestions()");
    const end = mirror.indexOf("\n}", start) + 2;
    expect(end, "the suggestions builder could not be delimited").toBeGreaterThan(start);
    expect(mirror.slice(start, end)).not.toMatch(/<button|<a /);
  });

  it("pins the Work list's own structure, which slice 2L.1 added to the lane", () => {
    /*
     * `2L-ACCESS-001`. Every class below is load-bearing for an assertion the
     * lane makes: the row actions and the quick-edit summary are measured by
     * the touch-target check, the protected stub and its toggle are what the
     * masked row *is*, and the undo button is the control `2L-EDIT-008` added.
     * A component that renamed one would leave the lane scanning markup the
     * product no longer emits — green, and about nothing.
     */
    const list = read("src/features/operations/task-list.tsx");
    const protectedContent = read("src/features/operations/protected-content.tsx");
    const quickEdit = read("src/features/operations/quick-edit.tsx");
    const undo = read("src/features/operations/undo-affordance.tsx");

    for (const [source, name, tokens] of [
      [list, "task-list.tsx", ["list-row", "list-row-main", "list-meta", "work-origin"]],
      [protectedContent, "protected-content.tsx", ["work-protected", "work-protected-label", "work-protected-toggle", 'data-masked="true"']],
      [quickEdit, "quick-edit.tsx", ["work-quick-edit", "work-quick-edit-summary"]],
      [undo, "undo-affordance.tsx", ["work-undo", "work-undo-button", "work-undo-window"]],
    ] as const) {
      for (const token of tokens) {
        expect(source, `${name} no longer emits ${token}`).toContain(token);
        expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
      }
    }
  });

  it("pins the task panel's frame and its close control", () => {
    // `2L-EDIT-007`. The panel's frame is the only thing that differs between
    // the two mounts, so it is the only thing the mirror can get wrong about a
    // surface whose controls are shared by construction.
    const view = read("src/features/daily-cycle/task-detail-view.tsx");
    const close = read("src/features/daily-cycle/task-panel-close.tsx");
    for (const token of ["task-detail-panel", "task-detail-header", "task-detail-section"]) {
      expect(view, `task-detail-view.tsx no longer emits ${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
    for (const token of ["back-link", "task-panel-close"]) {
      expect(close, `task-panel-close.tsx no longer emits ${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
    // A button, not an anchor: it performs a history operation rather than
    // naming a destination, and the mirror has to represent that or the lane
    // would scan a link the product does not render.
    expect(close).toMatch(/<button/);
    expect(mirror).toMatch(/<button class="back-link task-panel-close"/);
  });

  it("pins selection, preview and result, which slice 2L.2 added to the lane", () => {
    /*
     * `2L-ACCESS-001`/`-005`/`-006`. Each class below carries an assertion:
     * `work-row-select` is the checkbox the mobile target-size check measures,
     * `work-bulk-form` holds the two pickers the focus walk visits, and
     * `work-bulk-result` is the focusable landmark the result moves focus to.
     */
    const list = read("src/features/operations/task-list.tsx");
    const bar = read("src/features/operations/bulk-bar.tsx");

    for (const token of ["work-row-select"]) {
      expect(list, `task-list.tsx no longer emits ${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
    for (const token of [
      "work-bulk-bar",
      "work-bulk-selection",
      "work-bulk-hint",
      "work-bulk-form",
      "work-bulk-preview",
      "work-bulk-result",
      "work-bulk-result-list",
      'aria-live="polite"',
    ]) {
      expect(bar, `bulk-bar.tsx no longer emits ${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
    // Every `<label>` in the real bar resolves to a control, and the mirror is
    // only useful if it carries the same property.
    expect(bar).toContain("htmlFor");
    expect(mirror).toContain('for="work-bulk-action"');
    expect(mirror).toContain('for="work-bulk-value"');
  });

  it("pins the narrowing controls, which slice 2L.3 added to the lane", () => {
    // `2L-ACCESS-003`/`-005`. `aria-current` is the assertion that matters: the
    // active filter must be exposed to a screen reader and not only painted, and
    // a mirror that dropped it would leave the lane green about a colour.
    const filters = read("src/features/daily-cycle/work-filters.tsx");
    const view = read("src/features/daily-cycle/work-view.tsx");

    for (const token of ["work-filters", "work-filter-group", "work-filter-relation", "aria-current"]) {
      expect(filters, `work-filters.tsx no longer emits ${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
    for (const token of ["work-group", "work-group-heading", "work-group-count", "work-position-adjusted"]) {
      expect(view, `work-view.tsx no longer emits ${token}`).toContain(token);
      expect(mirror, `${MIRROR} no longer mirrors ${token}`).toContain(token);
    }
    // A `<fieldset>`/`<legend>` group, not a div: the group has to announce what
    // it narrows, and the mirror is only useful if it carries the same shape.
    expect(filters).toContain("<legend>");
    expect(mirror).toContain("<legend>");
  });

  it("states its own limits, so a green lane is never read as more than it is", () => {
    // The three sentences below are the difference between an honest partial
    // and the over-claim `2I-CLOSE-002` exists to prevent. They are asserted
    // because a future edit that quietly deletes them would turn this lane into
    // a claim nobody checked.
    expect(mirror).toMatch(/NOT PROVEN HERE: hydrated interactivity/);
    expect(mirror).toMatch(/NOT PROVEN ANYWHERE: a real screen-reader session/);
    expect(mirror).toMatch(/never be cited as discharging it/);
  });

  it("keeps axe-core a declared dependency rather than a borrowed transitive one", () => {
    const manifest = JSON.parse(read("package.json")) as {
      devDependencies?: Record<string, string>;
    };
    expect(
      manifest.devDependencies?.["axe-core"],
      "axe-core must be declared: a scanner that arrives by someone else's hoisting can vanish on an unrelated update",
    ).toBeTruthy();
  });

  it("keeps the lane wired into CI, because a spec nothing runs proves nothing", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("e2e/accessibility.spec.ts");
    // Both viewports, or the mobile-only touch-target contract never executes.
    const step = workflow.slice(workflow.indexOf("e2e/accessibility.spec.ts"));
    expect(step.slice(0, 200)).toContain("--project=desktop");
    expect(step.slice(0, 200)).toContain("--project=mobile");
  });
});
