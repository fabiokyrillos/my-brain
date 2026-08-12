import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `2L-MOBILE-004` — OD-2L-5 option A: **no gesture ships on any Work surface.**
 *
 * ## Why a permanent guard rather than a review note
 *
 * The owner signed "no gesture", and the requirement adds a clause that a review
 * cannot enforce: *including one added "in preparation"*. A handler added for a
 * later phase looks harmless in a diff — it does nothing yet — and by the time
 * anybody notices, the decision has been overtaken by code rather than by a
 * decision. So the absence is asserted mechanically, on every run, over a
 * **named** set of surfaces.
 *
 * ## What counts as a gesture
 *
 * The four families OD-2L-5 names — touch, pointer, drag and swipe — in the two
 * shapes React and the DOM express them: a JSX prop (`onTouchStart`,
 * `onPointerMove`, `onDragStart`) and a listener registration
 * (`addEventListener("touchmove", …)`). A library that bound one for us would
 * appear as an import, so the surface set is scanned for those too.
 *
 * `onClick`, `onChange` and `onSubmit` are **not** gestures and are deliberately
 * not matched: they are what a visible, labelled control does when it is used.
 *
 * ## Why comments are stripped first
 *
 * This repository has lost a slice to a guard that read its own documentation as
 * a violation. The modules below explain *why* they carry no gesture, which
 * means they name the things they refuse — and a guard that fired on that would
 * fail the very file written to satisfy it.
 */

const REPO = join(__dirname, "..", "..", "..");

/**
 * The surfaces the decision governs, **by name**.
 *
 * A directory walk would be simpler and would also silently extend the ban to
 * files OD-2L-5 never mentioned. Naming them is what makes the guard a
 * statement about a decision rather than a house style — and adding a Work
 * surface without adding it here is caught by the completeness check below.
 */
const WORK_SURFACES = [
  "src/features/operations/task-list.tsx",
  "src/features/operations/work-item-actions.tsx",
  "src/features/operations/quick-edit.tsx",
  "src/features/operations/bulk-bar.tsx",
  "src/features/operations/protected-content.tsx",
  "src/features/operations/undo-affordance.tsx",
  "src/features/operations/inline-create-form.tsx",
  "src/features/daily-cycle/work-view.tsx",
  "src/features/daily-cycle/work-filters.tsx",
  "src/features/daily-cycle/task-detail-view.tsx",
  "src/features/daily-cycle/task-detail-surface.tsx",
  "src/features/daily-cycle/task-panel-close.tsx",
  "src/features/task-commands/task-detail-controls.tsx",
] as const;

export const GESTURE_PATTERNS: readonly RegExp[] = [
  // React props: `onTouchStart`, `onPointerDown`, `onDragOver`, `onSwipe…`.
  /\bon(Touch|Pointer|Drag|Swipe)[A-Z]\w*\s*=/,
  // DOM registration, in either quote style.
  /addEventListener\(\s*["'`](touch|pointer|drag|swipe)[a-z]*["'`]/i,
  // A library that would bind them for us.
  /from\s+["'`][^"'`]*(hammerjs|react-swipeable|use-gesture|swiper)[^"'`]*["'`]/i,
  // The CSS escape hatch a drag implementation reaches for first.
  /touch-action\s*:/i,
];

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export function findGestures(source: string): string[] {
  const code = stripComments(source);
  return GESTURE_PATTERNS.filter((pattern) => pattern.test(code)).map((pattern) => pattern.source);
}

const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

describe("2L-MOBILE-004: no gesture ships on a Work surface (OD-2L-5 option A)", () => {
  it("finds none, on any of the named surfaces", () => {
    const offenders = WORK_SURFACES
      .map((file) => ({ file, found: findGestures(read(file)) }))
      .filter((entry) => entry.found.length > 0);
    expect(offenders).toEqual([]);
  });

  it("scans files that exist, so a renamed surface cannot silently drop out", () => {
    for (const file of WORK_SURFACES) {
      expect(statSync(join(REPO, file)).isFile(), `${file} is not a file`).toBe(true);
    }
  });

  it("names every Work-surface component there is", () => {
    /*
     * The completeness half. A guard over a hand-written list protects exactly
     * the list — so the list is compared against the components that actually
     * render Work, discovered from disk. A new one has to be added here, which
     * is the reviewed edit the decision deserves.
     */
    const discovered: string[] = [];
    for (const dir of ["src/features/operations", "src/features/daily-cycle"]) {
      for (const entry of readdirSync(join(REPO, dir))) {
        if (!entry.endsWith(".tsx") || entry.endsWith(".test.tsx")) continue;
        const relative = `${dir}/${entry}`;
        // A Work surface is one that renders a task list, a task, or the
        // controls over them. `work`/`task` in the filename is the same rule the
        // plan's own file list used.
        if (/^(work|task|quick-edit|bulk|selection|protected|undo)/.test(entry)) discovered.push(relative);
      }
    }
    const missing = discovered.filter((file) => !(WORK_SURFACES as readonly string[]).includes(file));
    expect(missing, "a Work surface exists that the no-gesture guard does not scan").toEqual([]);
  });

  /**
   * `2M-MOBILE-003`, OD-2M-6 option A — the same ban, one surface over.
   *
   * The calendar is where drag-to-reschedule is most tempting: it is the
   * interaction every other calendar has, and it is the one OD-2M-6 refused —
   * because it makes the primary path unreachable by keyboard, unusable by
   * screen reader, and adds a second hardware-dependent verification to a phase
   * that already carries one. The refusal covers a handler added *"in
   * preparation"*, so the guard names the calendar's files rather than waiting
   * for one to appear.
   *
   * Its own describe block rather than an addition to `WORK_SURFACES`, because
   * the two lists answer to two different decisions: OD-2L-5 governs Work and
   * OD-2M-6 governs the calendar, and a single list would make a future
   * amendment to one silently amend the other.
   */
  const CALENDAR_SURFACES = [
    "src/features/calendar/calendar-view.tsx",
    "src/features/calendar/calendar-item.tsx",
    /*
     * Added by slice 2M.1 part 3, and it is the file the ban was written for:
     * a reschedule control is exactly where drag-to-move would be implemented.
     * The discovery assertion below is what made adding it mandatory rather
     * than remembered.
     */
    "src/features/calendar/calendar-reschedule.tsx",
    /*
     * Added when `2M-CAL-010`'s outcome was hoisted out of the item that
     * produced it. It renders an undo — a control a "swipe to undo" would be
     * fitted to — and the discovery assertion below required naming it here
     * before the suite would go green, which is the guard doing its job on its
     * second occasion.
     */
    "src/features/calendar/calendar-outcome.tsx",
    /*
     * Added by slice 2M.2. The planner lives under `/app/calendar` and is
     * governed by the same OD-2M-6 A signature, and it is the surface where a
     * "drag a task onto a day" affordance would be most tempting of all --
     * every other planner has one. It is named here rather than left to the
     * `src/features/calendar` discovery sweep below, which cannot see another
     * directory.
     */
    "src/features/planning/planner-view.tsx",
    /*
     * Added by slice 2M.4a, which is where `2M-MOBILE-003` asked for them: "the
     * no-gesture guard is extended to name the new surfaces", and the new
     * surfaces of slices 2M.3 and 2M.4a are the day review and the notification
     * governance section. The review is the more tempting of the two -- a
     * "swipe a row away to archive it" is the single most common gesture in
     * every review product there is, and `archive` here is a **confirmed
     * destructive** verb, so a swipe would be a one-gesture route to a
     * transition the taxonomy requires a dialog for.
     */
    "src/features/day-review/day-review-view.tsx",
    "src/features/notifications/notification-settings.tsx",
    /*
     * Added by slice 2M.4b, and the discovery assertion below is what made
     * adding it mandatory rather than remembered — the third occasion this
     * guard has caught a surface that would otherwise have shipped unscanned.
     *
     * It is also the surface where the ban matters most in this slice. This is
     * the only file in the repository permitted to raise a browser permission
     * prompt, and a permission denial is STICKY: on most browsers the user
     * cannot be asked again without digging through settings (T-07). A prompt
     * reachable by a swipe, a long-press or any affordance a user can trigger
     * without meaning to would be a one-gesture route to a permanently denied
     * notification permission — the least recoverable outcome on this surface,
     * and one no undo can reach.
     */
    "src/features/notifications/push-controls.tsx",
  ] as const;

  it("finds no gesture on any calendar surface either (2M-MOBILE-003)", () => {
    const offenders = CALENDAR_SURFACES
      .map((file) => ({ file, found: findGestures(read(file)) }))
      .filter((entry) => entry.found.length > 0);
    expect(offenders).toEqual([]);
  });

  it("names every calendar component there is", () => {
    const discovered: string[] = [];
    for (const entry of readdirSync(join(REPO, "src/features/calendar"))) {
      if (!entry.endsWith(".tsx") || entry.endsWith(".test.tsx")) continue;
      discovered.push(`src/features/calendar/${entry}`);
    }
    expect(discovered.length, "no calendar component was discovered").toBeGreaterThan(0);
    const missing = discovered.filter((file) => !(CALENDAR_SURFACES as readonly string[]).includes(file));
    expect(missing, "a calendar surface exists that the no-gesture guard does not scan").toEqual([]);
  });

  it("names every day-review and notification component there is", () => {
    // The same discovery assertion, over the two directories slices 2M.3 and
    // 2M.4a added. Without it a component added later would be invisible to the
    // ban -- which is exactly how `calendar-outcome.tsx` came to be named above.
    const discovered: string[] = [];
    for (const directory of ["src/features/day-review", "src/features/notifications"]) {
      for (const entry of readdirSync(join(REPO, directory))) {
        if (!entry.endsWith(".tsx") || entry.endsWith(".test.tsx")) continue;
        discovered.push(`${directory}/${entry}`);
      }
    }
    expect(discovered.length, "no day-review or notification component was discovered").toBeGreaterThan(1);
    const missing = discovered.filter((file) => !(CALENDAR_SURFACES as readonly string[]).includes(file));
    expect(missing, "a surface exists that the no-gesture guard does not scan").toEqual([]);
  });

  it("names every planner component there is", () => {
    // The same discovery assertion, over the other directory OD-2M-6 A governs.
    // Without it, a planner component added later would be invisible to the ban
    // -- which is exactly how `calendar-outcome.tsx` came to be named above.
    const discovered: string[] = [];
    for (const entry of readdirSync(join(REPO, "src/features/planning"))) {
      if (!entry.endsWith(".tsx") || entry.endsWith(".test.tsx")) continue;
      discovered.push(`src/features/planning/${entry}`);
    }
    expect(discovered.length, "no planner component was discovered").toBeGreaterThan(0);
    const missing = discovered.filter((file) => !(CALENDAR_SURFACES as readonly string[]).includes(file));
    expect(missing, "a planner surface exists that the no-gesture guard does not scan").toEqual([]);
  });

  it("keeps every calendar action reachable by a visible, labelled link", () => {
    // `2M-MOBILE-003`'s other half, and the reason the ban costs nothing here:
    // navigation, orientation and lane visibility are `<Link>`s, so every action
    // is keyboard-operable and screen-reader-addressable without a gesture to
    // replace. A control implemented as an unlabelled div would pass the gesture
    // ban and fail the requirement.
    const view = stripComments(read("src/features/calendar/calendar-view.tsx"));
    expect(view).toMatch(/<Link\b/);
    expect(view).not.toMatch(/<div[^>]*onClick/);
    expect(view).not.toMatch(/role="button"/);
  });

  it("keeps the CSS free of a drag escape hatch too", () => {
    // `touch-action` is where a drag implementation starts, and it would sit in
    // the stylesheet rather than in a component.
    expect(stripCss(read("src/app/operations.css"))).not.toMatch(/touch-action/i);
  });
});

/* -------------------------------------------------------------------------- */
/* The guard, applied to planted sources                                       */
/* -------------------------------------------------------------------------- */

const roots: string[] = [];

function planted(contents: string): string {
  const root = mkdtempSync(join(tmpdir(), "phase-2l-gesture-"));
  roots.push(root);
  const absolute = join(root, "surface.tsx");
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, contents);
  return readFileSync(absolute, "utf8");
}

describe("the no-gesture guard itself", () => {
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("fires on each of the four families OD-2L-5 names", () => {
    for (const offending of [
      `<article onTouchStart={() => setDragging(true)} />`,
      `<article onPointerDown={begin} />`,
      `<article onDragStart={begin} />`,
      `<article onSwipeLeft={complete} />`,
      `node.addEventListener("touchmove", handler);`,
      `node.addEventListener('pointerup', handler)`,
      `import { useSwipeable } from "react-swipeable";`,
      `.list-row { touch-action: pan-y; }`,
    ]) {
      expect(findGestures(planted(offending)), offending).not.toEqual([]);
    }
  });

  it("fires on a handler added *in preparation*, which is the clause that matters", () => {
    // The requirement's own words. A handler that does nothing yet is the shape
    // a review waves through and a decision dies to.
    const prepared = planted(
      `export function Row() {\n`
      + `  // Groundwork for the next phase; does nothing today.\n`
      + `  const onTouchStart = () => {};\n`
      + `  return <article onTouchStart={onTouchStart} />;\n`
      + `}\n`,
    );
    expect(findGestures(prepared)).not.toEqual([]);
  });

  it("does not fire on a comment that names a gesture, but does on a real one beside it", () => {
    const mentionOnly = planted(
      `/** No gesture ships here: no onTouchStart, no addEventListener("touchmove"). */\n`
      + `// <article onDragStart={begin} />\n`
      + `export const NOTE = "no gesture";\n`,
    );
    expect(findGestures(mentionOnly)).toEqual([]);

    const mentionAndReal = planted(
      `/** No gesture ships here. */\n`
      + `export const Row = () => <article onDragStart={begin} />;\n`,
    );
    expect(findGestures(mentionAndReal)).not.toEqual([]);
  });

  it("does not fire on the ordinary controls a visible affordance uses", () => {
    for (const legitimate of [
      `<button onClick={apply} />`,
      `<input onChange={setValue} />`,
      `<form onSubmit={submit} />`,
      `<input onCompositionStart={begin} onCompositionEnd={end} />`,
    ]) {
      expect(findGestures(planted(legitimate)), legitimate).toEqual([]);
    }
  });
});

function stripCss(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}
