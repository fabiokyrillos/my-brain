import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `2M-AUDIT-006` / `2M-NOTIFY-010` — the push boundary, with the blind spot
 * closed **before** anything is put through it.
 *
 * ## The defect this exists to fix
 *
 * `sensitivity-convergence.test.ts` asserts that nothing in this repository
 * registers a push subscription or calls `showNotification`. That assertion is
 * true, and it has been quoted as "there is no service worker" — which is
 * **false**.
 *
 * `public/sw.js` exists and is **registered in production** by
 * `src/features/pwa/register-service-worker.tsx`, from `src/app/layout.tsx`. It
 * caches static assets, calls `skipWaiting()` and `clients.claim()`, and has no
 * push handler. The existing guard cannot see it, because its scope is
 * `.ts`/`.tsx` files under `src/features/pwa`, `src/features/agent` and
 * `src/app` — and `public/sw.js` is neither.
 *
 * So the only guard claiming the absence of push **could not have detected a
 * push handler in the one file where a push handler actually goes.**
 *
 * ## What this guard does
 *
 * It scans `public/` too, and `.js` too. It is written now, in slice 2M.0, so
 * that when slice 2M.4b adds a `push` listener to `public/sw.js` the guard is
 * already watching the file rather than being extended to permit what has just
 * been added — which is the order that makes a guard mean something.
 *
 * Until 2M.4b lands, **the expected state is zero push artifacts anywhere**, and
 * that is what this asserts. When 2M.4b lands, the allowlist below gains
 * `public/sw.js` and the server sender **by name**, and every other location
 * stays forbidden.
 */

const REPO = join(__dirname, "..", "..", "..");

/**
 * Where a push artifact could live. Deliberately wider than the guard it
 * supersedes: it includes `public/`, and it matches `.js`.
 */
const SCANNED_TREES = ["src", "public", "supabase/functions"];

/**
 * The APIs that constitute a push surface. Each is an artifact, not a mention.
 */
const PUSH_APIS: ReadonlyArray<readonly [string, RegExp]> = [
  ["a notification rendered by a service worker", /\bshowNotification\b/],
  ["a push subscription manager", /\bPushManager\b|\bpushManager\b/],
  ["a stored push subscription", /\bpushSubscription\b|\bpush_subscription\b/],
  ["a web-push sender", /\bweb-push\b|\bwebpush\b/],
  // No trailing boundary: the key almost always arrives as `VAPID_PUBLIC_KEY`
  // or `vapidPrivateKey`, and `\bVAPID\b` matches neither.
  ["a VAPID key", /\bvapid/i],
  ["a service-worker push listener", /addEventListener\(\s*["']push["']/],
  ["a notification-click listener", /addEventListener\(\s*["']notificationclick["']/],
  ["a browser permission request", /Notification\.requestPermission|requestPermission\(/],
];

/**
 * Files permitted to carry a push artifact, **by name**.
 *
 * Empty until slice 2M.4b. Adding to it is a deliberate act that shows up in a
 * diff as what it is: a decision to put a push artifact somewhere.
 */
const ALLOWED: readonly string[] = [];

/**
 * The guards that *declare* these APIs as patterns, and are therefore exempt.
 *
 * A guard has to name what it forbids. Scanning one is scanning its own
 * vocabulary, and the only way to silence the report would be to delete the
 * patterns that make it a guard. The list is **exactly two files** and the test
 * below asserts that, because a broadened exemption is how a guard stops
 * guarding.
 */
const PATTERN_DECLARING_GUARDS: readonly string[] = [
  "src/lib/closeout/phase-2m-push-boundary-guard.test.ts",
  "src/lib/closeout/sensitivity-convergence.test.ts",
];

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

function scannedFiles(root: string, dir: string, found: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(join(root, dir));
  } catch {
    return found;
  }
  for (const entry of entries) {
    const relative = `${dir}/${entry}`;
    if (statSync(join(root, relative)).isDirectory()) scannedFiles(root, relative, found);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) found.push(relative);
  }
  return found;
}

export function pushArtifacts(root: string): Array<{ api: string; where: string }> {
  const found: Array<{ api: string; where: string }> = [];
  for (const tree of SCANNED_TREES) {
    for (const file of scannedFiles(root, tree)) {
      if (PATTERN_DECLARING_GUARDS.includes(file) || ALLOWED.includes(file)) continue;
      const code = stripComments(readFileSync(join(root, file), "utf8"));
      for (const [api, pattern] of PUSH_APIS) {
        if (pattern.test(code)) found.push({ api, where: file });
      }
    }
  }
  return found;
}

const roots: string[] = [];
function scratchRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "push-"));
  for (const dir of [...SCANNED_TREES, "src/features/pwa"]) mkdirSync(join(root, dir), { recursive: true });
  roots.push(root);
  return root;
}

describe("2M-AUDIT-006: the service worker exists, and the guard can now see it", () => {
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("records that public/sw.js exists and is registered in production", () => {
    // Stated as an assertion because the predecessor's re-audit said the
    // opposite, and a document that is wrong about this would make slice 2M.4b
    // look like a greenfield addition rather than a change to a worker already
    // installed on every production client.
    const worker = readFileSync(join(REPO, "public/sw.js"), "utf8");
    expect(worker).toMatch(/addEventListener\(\s*["']install["']/);
    expect(worker).toMatch(/skipWaiting\(\)/);
    expect(worker).toMatch(/clients\.claim\(\)/);

    const register = readFileSync(join(REPO, "src/features/pwa/register-service-worker.tsx"), "utf8");
    expect(register).toMatch(/navigator\.serviceWorker\.register\("\/sw\.js"\)/);
    expect(readFileSync(join(REPO, "src/app/layout.tsx"), "utf8")).toMatch(/RegisterServiceWorker/);
  });

  it("scans public/ and .js, which the guard it supersedes does not", () => {
    // The blind spot, demonstrated rather than described: a push listener in
    // `public/sw.js` is invisible to a scan scoped to `.ts`/`.tsx` under `src/`.
    const root = scratchRoot();
    writeFileSync(
      join(root, "public/sw.js"),
      'self.addEventListener("push", (event) => { self.registration.showNotification("x"); });\n',
    );
    const found = pushArtifacts(root);
    expect(found.map((f) => f.where)).toContain("public/sw.js");
    expect(found.map((f) => f.api)).toContain("a service-worker push listener");
    expect(found.map((f) => f.api)).toContain("a notification rendered by a service worker");
  });

  it("fires on a subscription, a sender, a VAPID key and a permission request", () => {
    const root = scratchRoot();
    writeFileSync(join(root, "src/features/pwa/subscribe.ts"), "registration.pushManager.subscribe();\n");
    writeFileSync(join(root, "supabase/functions/send.ts"), "import webpush from 'web-push';\n");
    writeFileSync(join(root, "src/features/pwa/keys.ts"), "const VAPID_PUBLIC = '';\n");
    writeFileSync(join(root, "src/features/pwa/ask.tsx"), "Notification.requestPermission();\n");
    const apis = new Set(pushArtifacts(root).map((f) => f.api));
    expect(apis).toContain("a push subscription manager");
    expect(apis).toContain("a web-push sender");
    expect(apis).toContain("a VAPID key");
    expect(apis).toContain("a browser permission request");
  });

  it("does not fire on the existing cache-only worker", () => {
    // The control. The worker that ships today must pass, or the guard is
    // measuring the wrong thing and would be silenced on its first run.
    const root = scratchRoot();
    writeFileSync(join(root, "public/sw.js"), readFileSync(join(REPO, "public/sw.js"), "utf8"));
    expect(pushArtifacts(root)).toEqual([]);
  });
});

describe("2M-NOTIFY-006/-007: nothing has left the application yet", () => {
  it("finds no push artifact anywhere in this repository", () => {
    // The state slice 2M.0 closes in. Slice 2M.4b changes it, and when it does
    // the change is a named entry in ALLOWED rather than a widened pattern.
    expect(pushArtifacts(REPO)).toEqual([]);
  });

  it("keeps the allowlist empty until the slice that earns an entry", () => {
    expect(ALLOWED).toEqual([]);
  });

  it("exempts exactly the two guards that declare these patterns, and nothing else", () => {
    expect([...PATTERN_DECLARING_GUARDS].sort()).toEqual([
      "src/lib/closeout/phase-2m-push-boundary-guard.test.ts",
      "src/lib/closeout/sensitivity-convergence.test.ts",
    ]);
    // The exemption is narrow rather than a directory: another file under the
    // same directory is still scanned.
    const root = scratchRoot();
    mkdirSync(join(root, "src/lib/closeout"), { recursive: true });
    writeFileSync(
      join(root, "src/lib/closeout/some-other-guard.test.ts"),
      "registration.pushManager.subscribe();\n",
    );
    expect(pushArtifacts(root).map((f) => f.where))
      .toContain("src/lib/closeout/some-other-guard.test.ts");
  });

  it("keeps the payload copy incapable of carrying content", () => {
    // `notificationCopy(locale)` takes exactly one parameter, and it is the
    // locale. This is the structural half of `2M-NOTIFY-007`: the payload has
    // nowhere to put content, so the prohibition is not a promise.
    const contract = readFileSync(join(REPO, "src/features/sensitivity/contracts.ts"), "utf8");
    const signature = contract.match(/export function notificationCopy\(([^)]*)\)/);
    expect(signature, "notificationCopy not found").not.toBeNull();
    expect(signature![1]).toBe('locale: "pt-BR" | "en"');
  });
});
