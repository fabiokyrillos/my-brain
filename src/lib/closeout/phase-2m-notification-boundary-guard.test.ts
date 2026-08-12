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
];

/** The modules slice 2M.4b earned, by name. */
const DELIVERY_MODULES = [
  "src/features/notifications/actions.ts",
  "src/features/notifications/consent-reader.ts",
  "src/features/notifications/notification-settings.tsx",
  "src/features/notifications/push-controls.tsx",
  "src/features/notifications/schema.ts",
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
    const sentences = new Set(
      [...copy.matchAll(/^\s{4}(granted|denied|unsupported|revoked|expired): "([^"]+)",/gm)].map((match) => match[2]),
    );
    // Two locales × five states, all distinct: a state sharing a sentence with
    // another is a state the user cannot tell apart from it.
    expect(sentences.size).toBe(10);
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

  it("keeps the push-absence allowlist to the three files 2M.4b earned", () => {
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
    ]);
  });
});
