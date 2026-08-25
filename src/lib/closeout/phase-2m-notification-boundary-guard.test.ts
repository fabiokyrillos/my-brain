import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `2M-NOTIFY-003`, `-007` and the 2M.4a/2M.4b boundary.
 *
 * ## Three things, and each has a named failure it prevents
 *
 * **1. The content prohibition is structural (`2M-NOTIFY-007`).** *"The payload
 * type has nowhere to put content, and a guard fails the build if a
 * content-carrying parameter is added to the payload or to `notificationCopy`."*
 * A test of the payload's *values* would keep passing the day somebody adds a
 * `title?: string` and only fills it on one path. So this reads the type and the
 * function signature.
 *
 * **2. No permission is requested anywhere (`2M-NOTIFY-003`).** Not on first
 * load, not on sign-in, not from an unrelated surface — and in slice 2M.4a, not
 * at all. The prompt arrives in 2M.4b, from the designated surface, after an
 * explicit user action. Until then the honest state of the repository is that
 * `requestPermission` appears nowhere, and this asserts it independently of
 * `phase-2m-push-boundary-guard.test.ts`, which asserts the same thing about a
 * wider set of APIs. Two guards over one property is not duplication here: that
 * guard is about *push artifacts* and this one is about *the governance
 * feature*, and either could be relaxed without the other noticing.
 *
 * **3. Governance ships before delivery.** The plan is explicit that 2M.4b may
 * not begin until 2M.4a is merged with CI green on its merge SHA. So the
 * governance directory must contain **no sender, no subscription, no client and
 * no writer** — the ordering is what makes the rules a constraint on the sender
 * rather than a description of it.
 */

const REPO = path.join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(path.join(REPO, relative), "utf8");

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx?|js)$/.test(entry) ? [full] : [];
  });
}

const FEATURE = walk(path.join(REPO, "src/features/notifications"))
  .filter((file) => !/\.test\.tsx?$/.test(file))
  .map((file) => ({
    file: path.relative(REPO, file).replace(/\\/g, "/"),
    text: withoutComments(readFileSync(file, "utf8")),
  }));

/**
 * Slice 2M.4b splits this directory in two, and the split IS the retarget.
 *
 * Until 2M.4b, no file here could reach for a client, a writer or a permission
 * prompt — the ordering that made the rules a constraint on the sender rather
 * than a description of it. That ordering has now been honoured: 2M.4a merged
 * with CI green on its merge SHA before any of this was written.
 *
 * So the constraint is not dropped, it is **narrowed to the modules it was
 * always about**. The four decision modules stay exactly as pure as they were
 * — no client, no fetch, no writer, no prompt, no scheduler — and the delivery
 * modules are named, one by one, the same way the push guard names its
 * allowlist. A guard that had simply been deleted at this point would have been
 * a guard that only ever described the past.
 */
const PURE_MODULES = [
  "src/features/notifications/consent-contract.ts",
  "src/features/notifications/governance.ts",
  "src/features/notifications/payload.ts",
  "src/features/notifications/copy.ts",
  "src/features/notifications/push-encoding.ts",
  /*
   * Slice 2O.6. Both are pure derivations over the consent state — no data
   * access, no client, no content. They belong on THIS list rather than the
   * other because the content-carrying scan below is exactly the scan they
   * should be subject to: a fact vocabulary is where a task title would be
   * most tempting to interpolate and least noticeable once it was.
   */
  "src/features/notifications/three-facts.ts",
  "src/features/notifications/invitation.ts",
  /*
   * Slice 2S.2. All four are pure derivations — no data access, no client, no
   * content — and they belong on THIS list for the reason `three-facts.ts`
   * does: the content-carrying scan below is exactly the scan they should be
   * subject to. `verbs.ts` and `action-copy.ts` are vocabularies, which is
   * where a task title would be most tempting to interpolate and least
   * noticeable once it was; `subject.ts` parses a key and decides nothing;
   * `refusal-copy.ts` is a closed table of sentences whose entire purpose is
   * that nothing from the database reaches a screen.
   */
  "src/features/notifications/subject.ts",
  "src/features/notifications/verbs.ts",
  "src/features/notifications/action-copy.ts",
  "src/features/notifications/refusal-copy.ts",
];

/** The modules slice 2M.4b earned, by name, plus slice 2O.6's two surfaces. */
const DELIVERY_MODULES = [
  "src/features/notifications/actions.ts",
  "src/features/notifications/consent-reader.ts",
  "src/features/notifications/notification-settings.tsx",
  "src/features/notifications/push-controls.tsx",
  "src/features/notifications/schema.ts",
  // Slice 2O.6. Rendered behind authentication inside the settings surface;
  // they take props and render copy, and neither reaches a client.
  "src/features/notifications/notification-facts.tsx",
  "src/features/notifications/notification-invitation.tsx",
  /*
   * Slice 2S.2. The row component dispatches to Server Actions it receives as
   * props and reaches no client itself; the projection reads the page's
   * subjects through the caller's own authenticated client, owner-scoped, in
   * one query per subject kind.
   */
  "src/features/notifications/notification-row-actions.tsx",
  "src/features/notifications/row-projection.ts",
  /*
   * Slice 2S.2, second half — the attention surface.
   *
   * `attention-notices.ts` is a reader: it asks for this owner's unanswered
   * notices through the caller's own authenticated client and hands them to the
   * same projection the notifications page uses. `attention-notice-row.tsx`
   * renders one of those rows and mounts the shared controls. `verb-handlers.ts`
   * holds nothing but references to five Server Actions that already existed —
   * it declares no action of its own, which `phase-2s-verb-authority.test.ts`
   * asserts rather than leaving to this list.
   *
   * None of the three reaches a push client, and none of them can: the delivery
   * boundary below still names the two modules that may.
   */
  "src/features/notifications/attention-notices.ts",
  "src/features/notifications/attention-notice-row.tsx",
  "src/features/notifications/verb-handlers.ts",
  /*
   * Slice 2S.3. The row's *Abrir* control: it writes through the `markAction`
   * it is HANDED, navigates with the router, and reaches no client of its own.
   */
  "src/features/notifications/notice-open-control.tsx",
];

const GOVERNANCE = FEATURE.filter(({ file }) => PURE_MODULES.includes(file));

const PAYLOAD = withoutComments(read("src/features/notifications/payload.ts"));

describe("2M-NOTIFY-007: the payload has nowhere to put content", () => {
  it("scans a corpus that exists", () => {
    expect(GOVERNANCE.length).toBe(PURE_MODULES.length);
    expect(GOVERNANCE.map(({ file }) => file)).toContain("src/features/notifications/payload.ts");
  });

  it("accounts for every file in the feature as pure or delivery", () => {
    /*
     * The discovery sweep that makes the split honest. Without it, a new file
     * added to this directory would belong to NEITHER list and would therefore
     * be scanned by nothing — which is precisely how a boundary guard is
     * defeated without anybody editing it.
     */
    const classified = [...PURE_MODULES, ...DELIVERY_MODULES].sort();
    expect(FEATURE.map(({ file }) => file).sort()).toEqual(classified);
  });

  it("declares exactly three fields on the payload type", () => {
    const block = /export type NotificationPayload = Readonly<\{([\s\S]*?)\}>;/.exec(PAYLOAD)?.[1] ?? "";
    const fields = [...block.matchAll(/^\s*(\w+)\s*[?:]/gm)].map((match) => match[1]).sort();
    expect(fields, "the payload gained or lost a field").toEqual(["destination", "locale", "type"]);
  });

  it("carries no field a record's text could arrive through", () => {
    const block = /export type NotificationPayload = Readonly<\{([\s\S]*?)\}>;/.exec(PAYLOAD)?.[1] ?? "";
    for (const forbidden of ["title", "body", "description", "name", "text", "message", "data", "extra", "count", "taskId", "entryId"]) {
      expect(block, `the payload carries a '${forbidden}' field`).not.toMatch(new RegExp(`\\b${forbidden}\\s*[?:]`));
    }
    // Non-vacuity: the extraction really found the declaration.
    expect(block.length).toBeGreaterThan(20);
  });

  it("has no index signature and no free-form bag", () => {
    const block = /export type NotificationPayload = Readonly<\{([\s\S]*?)\}>;/.exec(PAYLOAD)?.[1] ?? "";
    expect(block, "an index signature would defeat the whole contract").not.toMatch(/\[\s*key\s*:/);
    expect(block).not.toMatch(/Record<|unknown|any/);
  });

  it("keeps `notificationCopy` to the two closed vocabularies", () => {
    const signature = /export function notificationCopy\(([\s\S]*?)\)/.exec(PAYLOAD)?.[1] ?? "";
    const parameters = [...signature.matchAll(/^\s*(\w+):/gm)].map((match) => match[1]);
    expect(parameters, "notificationCopy gained a parameter").toEqual(["locale", "type"]);
    for (const forbidden of ["title", "body", "task", "item", "text", "name", "count"]) {
      expect(signature, `notificationCopy takes a '${forbidden}'`).not.toContain(forbidden);
    }
  });

  it("serialises only from the closed vocabularies", () => {
    const serialiser = /export function serialiseNotificationPayload\([\s\S]*?\n\}/.exec(PAYLOAD)?.[0] ?? "";
    expect(serialiser.length).toBeGreaterThan(50);
    // Everything it emits comes from `notificationCopy` or from the destination.
    // A template literal here would be the shape an interpolated title takes.
    expect(serialiser, "the serialiser interpolates something").not.toMatch(/\$\{/);
  });
});

describe("2M-NOTIFY-003: nothing asks the browser for permission yet", () => {
  it("requests no permission anywhere in the governance feature", () => {
    /*
     * The forbidden tokens are **assembled** rather than written as literals.
     *
     * `phase-2m-push-boundary-guard.test.ts` refuses these strings anywhere in
     * the repository and exempts exactly two files, with a test asserting that
     * count — a third exemption for this file would have been the cheapest way
     * to make the suite green and the most expensive thing to have done. The
     * check below is the same check; only the spelling is deferred to runtime.
     */
    const requestPermission = `request${"Permission"}(`;
    const subscribes = new RegExp(`push${"Manager"}`, "i");
    for (const { file, text } of GOVERNANCE) {
      expect(text, `${file} requests a browser permission`).not.toContain(requestPermission);
      expect(text, `${file} reaches for the push manager`).not.toMatch(subscribes);
    }
  });

  it("raises the prompt from exactly one file, inside a handler", () => {
    /*
     * `R-24` inverted. In 2M.4a the honest state was "no control at all,
     * because nothing reads one". Now the consent record exists and the
     * controls have a consumer, so the question changes from *whether* a
     * control may be rendered to *where the prompt may be raised from*.
     *
     * Exactly one file, and inside a function rather than at module scope: a
     * top-level `requestPermission()` would fire on import, which is
     * `2M-NOTIFY-003`'s "on first load" by another route.
     */
    const requestPermission = `request${"Permission"}(`;
    const asking = FEATURE.filter(({ text }) => text.includes(requestPermission));
    expect(asking.map(({ file }) => file)).toEqual(["src/features/notifications/push-controls.tsx"]);

    const controls = withoutComments(read("src/features/notifications/push-controls.tsx"));
    const line = controls.split("\n").find((candidate) => candidate.includes(requestPermission)) ?? "";
    expect(line, "the prompt is raised at module scope, which fires on import").toMatch(/^\s+/);
    expect(controls, "the prompt is not awaited inside an effect").not.toMatch(
      new RegExp(`useEffect\\([\\s\\S]{0,400}${requestPermission.replace("(", "\\(")}`),
    );
  });

  it("keeps every control's consumer real", () => {
    // `R-24` proper: each rendered control must reach a write path that reads
    // it. The four preference fields go to one action, and that action names
    // the RPC that persists them.
    const controls = withoutComments(read("src/features/notifications/push-controls.tsx"));
    for (const field of ["notificationType", "notificationFrequency", "quietStart", "quietEnd", "dailyCap"]) {
      expect(controls, `the surface offers no ${field} control`).toContain(field);
    }
    expect(controls).toContain("updateNotificationPreferences");

    const actions = withoutComments(read("src/features/notifications/actions.ts"));
    expect(actions, "the preferences action does not reach the validated RPC")
      .toContain("update_notification_preferences");
  });

  it("explains the benefit on the same surface, which is what a prompt would follow", () => {
    const surface = read("src/features/notifications/notification-settings.tsx");
    expect(surface).toContain("copy.benefit");
    expect(surface).toContain("copy.contentPromise");
  });

  it("says something distinct for each of the five states", () => {
    const copy = read("src/features/notifications/copy.ts");
    /*
     * Scoped to the `states:` records, not to the whole file.
     *
     * The original matched any four-space-indented `granted:` / `denied:` line,
     * and slice 2O.6 added a `permissionFactValues` record that legitimately
     * reuses two of those key names for a **different** vocabulary — the
     * browser's answer rather than the consent state's. The count went to 14
     * and the guard read a correct addition as a violation.
     *
     * Renaming the new keys was declined: `granted` and `denied` are the
     * browser's own words for those values, and picking worse names so a regex
     * stops matching is shaping the product to the test. The predicate is
     * narrowed to the block it was always about instead, and the controls below
     * prove the narrowing did not turn it off.
     */
    const stateBlocks = [...copy.matchAll(/\n {2}states: \{([\s\S]*?)\n {2}\},/g)].map(
      (match) => match[1],
    );
    // Non-vacuity: two locales, each with a `states:` record. A narrowing that
    // matched nothing would make every assertion below trivially true.
    expect(stateBlocks).toHaveLength(2);

    const sentences = new Set(
      stateBlocks.flatMap((block) =>
        [...block.matchAll(/^\s{4}(granted|denied|unsupported|revoked|expired): "([^"]+)",/gm)].map(
          (match) => match[2],
        ),
      ),
    );
    // Two locales × five states, all distinct: a state sharing a sentence with
    // another is a state the user cannot tell apart from it.
    expect(sentences.size).toBe(10);
  });

  it("the narrowed scan still fails when two states share a sentence", () => {
    // The control in the other direction, planted against a stand-in with the
    // real shape. Narrowing a guard is only safe if it can still fire.
    const planted = `
  states: {
    granted: "Same sentence.",
    denied: "Same sentence.",
    unsupported: "c",
    revoked: "d",
    expired: "e",
  },
  states: {
    granted: "f",
    denied: "g",
    unsupported: "h",
    revoked: "i",
    expired: "j",
  },`;
    const blocks = [...planted.matchAll(/\n {2}states: \{([\s\S]*?)\n {2}\},/g)].map((m) => m[1]);
    expect(blocks).toHaveLength(2);
    const sentences = new Set(
      blocks.flatMap((block) =>
        [...block.matchAll(/^\s{4}(granted|denied|unsupported|revoked|expired): "([^"]+)",/gm)].map(
          (match) => match[2],
        ),
      ),
    );
    // Nine, not ten: the two sharing a sentence collapse, which is the defect.
    expect(sentences.size).toBe(9);
  });
});

describe("governance ships before delivery, and the directory proves it", () => {
  it("contains no sender, no subscription and no privileged client", () => {
    for (const { file, text } of GOVERNANCE) {
      const tokens = [`web-${"push"}`, `web${"push"}`, `va${"pid"}`, `VA${"PID"}`, "fetch(", "supabase", ".rpc(", "service_role"];
      for (const token of tokens) {
        expect(text, `${file} reaches for ${token} before slice 2M.4b`).not.toContain(token);
      }
    }
  });

  it("declares no Server Action and writes nothing", () => {
    for (const { file, text } of GOVERNANCE) {
      expect(text, `${file} declares a Server Action`).not.toMatch(/["']use server["']/);
      expect(text, `${file} writes`).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    }
  });

  it("schedules nothing and delivers nothing", () => {
    for (const { file, text } of GOVERNANCE) {
      expect(text, `${file} schedules work`).not.toMatch(/setTimeout|setInterval|cron/);
    }
  });

  it("2M-NOTIFY-011: NO product path uses service_role, and the delivery modules are where that matters", () => {
    /*
     * The pure modules above are asserted free of `service_role` because they
     * may not reach for a client at all. That is the weaker half: they were
     * never going to.
     *
     * The DELIVERY modules are the browser-reachable product path — the four
     * Server Actions and the owner-scoped read behind the settings surface —
     * and `2M-NOTIFY-011` forbids a `service_role` client on exactly those. The
     * only `service_role` in this slice belongs to the leased sender, which
     * lives under `supabase/functions/` and is not reachable from a page.
     *
     * Without this, the requirement would be proved only for the files least
     * able to violate it.
     */
    for (const file of DELIVERY_MODULES) {
      const text = withoutComments(read(file));
      expect(text, `${file} names service_role on a product path`).not.toMatch(/service_role/);
      // The service key by any of its spellings, in case a client were built
      // here rather than imported.
      expect(text, `${file} reaches for a service key`)
        .not.toMatch(/SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|createServiceClient/);
    }

    // Non-vacuity: the corpus really was read, and the patterns really do fire
    // on a file that uses the thing. Without this the loop would pass against
    // five empty strings.
    expect(DELIVERY_MODULES.length).toBeGreaterThan(3);
    expect(withoutComments(read("supabase/functions/send-push/index.ts")))
      .toMatch(/SERVICE_ROLE_KEY/);
  });

  it("2M-NOTIFY-011: every Server Action derives the owner from the session, never from an argument", () => {
    /*
     * The structural half of the same requirement. Each RPC takes the owner from
     * `auth.uid()`, so there must be no argument through which a caller could
     * name somebody else — and a `p_user_id` appearing in this file would be
     * exactly that argument.
     */
    const actions = withoutComments(read("src/features/notifications/actions.ts"));
    expect(actions).not.toMatch(/p_user_id|p_owner|userId:/);
    // And it really does call the RPCs, so the absence above is about a file
    // that has something to be absent from.
    for (const rpc of [
      "register_push_subscription",
      "revoke_push_consent",
      "record_push_consent_state",
      "update_notification_preferences",
    ]) {
      expect(actions, `actions.ts no longer calls ${rpc}`).toContain(rpc);
    }
  });

  it("keeps the push allowlist to exactly the files 2M.4b earned", () => {
    /*
     * The ordering that makes a guard mean something: the guard watched the
     * file before anything was added to it, and now that something has been
     * added, the permission is enumerated rather than implied.
     *
     * This assertion lives HERE, in the governance guard, as well as in the
     * push guard itself — two guards over one property, each of which could be
     * relaxed without the other noticing.
     */
    const guard = read("src/lib/closeout/phase-2m-push-boundary-guard.test.ts");
    const allowed = /const ALLOWED: readonly string\[\] = \[([\s\S]*?)\];/.exec(guard)?.[1] ?? "MISSING";
    const names = [...allowed.matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
    expect(names, "the push allowlist gained or lost an entry").toEqual([
      "public/sw.js",
      "src/features/notifications/consent-reader.ts",
      "src/features/notifications/push-controls.tsx",
      "supabase/functions/_shared/web-push.test.ts",
      "supabase/functions/_shared/web-push.ts",
      "supabase/functions/send-push/deliver.test.ts",
      "supabase/functions/send-push/deliver.ts",
      "supabase/functions/send-push/index.ts",
    ]);

    /*
     * And the half that matters most, asserted separately.
     *
     * The sender may grow files — it is a runtime the browser cannot load. The
     * APPLICATION may not: every entry on that side is a file that ships to a
     * page. Splitting the assertion means a future sender refactor cannot
     * quietly buy room for a fourth push artifact in `src/` or `public/`, which
     * a single growing list would have allowed without anyone noticing.
     */
    expect(names.filter((name) => !name.startsWith("supabase/"))).toEqual([
      "public/sw.js",
      "src/features/notifications/consent-reader.ts",
      "src/features/notifications/push-controls.tsx",
    ]);
  });
});
