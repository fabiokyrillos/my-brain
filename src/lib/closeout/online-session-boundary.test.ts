import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The test-harness security boundary, asserted against the source.
 *
 * `e2e/support/online-session.ts` is allowed to hold the **service-role key**,
 * and that permission is narrow on purpose. It exists so a disposable account
 * can be created, so an authentication link can be minted and exchanged, and so
 * the account can be removed afterwards. Those are Node-side HTTP calls made by
 * the test runner.
 *
 * What it must never become is a way for that capability to reach a browser. A
 * service-role token in a cookie, in storage state, or in anything page
 * JavaScript can read would turn a fixture into a generic authentication
 * shortcut — one that would then be tempting to reuse, and that would make
 * every journey's authorization assertions meaningless, because the client
 * would already be able to do anything.
 *
 * `e2e/online-session-fixture.spec.ts` proves the boundary holds at runtime
 * (storage state, `document.cookie`, `localStorage`, `sessionStorage`, and the
 * `role` claim of the token the browser actually holds). This proves it holds
 * in the source, which is the half that catches a change *before* someone has
 * to run a hosted suite to notice.
 *
 * Deliberately a plain text analysis rather than a type-level one: the property
 * is "this identifier never flows into these APIs", and the failure it guards
 * against is somebody adding a line, not somebody defeating a parser.
 */

const repositoryRoot = path.resolve(__dirname, "../../..");
const helperPath = path.join(repositoryRoot, "e2e/support/online-session.ts");
const e2eDirectory = path.join(repositoryRoot, "e2e");

const helper = readFileSync(helperPath, "utf8");

/** APIs that hand a value to the page, or persist one where the page can reach it. */
const BROWSER_FACING = [
  "addInitScript",
  "page.evaluate",
  "evaluateHandle",
  "storageState",
  "setExtraHTTPHeaders",
] as const;

/**
 * The only shapes in which the service-role key may appear in the helper: the
 * destructure that receives it, the Authorization/apikey headers of the two
 * admin calls, and prose. Anything else is a new flow and must be justified by
 * changing this list, which is the point — the list is the review.
 */
const PERMITTED_HELPER_USES = [
  /^const \{ supabaseUrl, serviceRoleKey, publishableKey, email, locale, appOrigin \} = input;$/,
  /^const \{ supabaseUrl, serviceRoleKey, publishableKey, email \} = input;$/,
  /^const session = await exchangeSession\(\{ supabaseUrl, serviceRoleKey, publishableKey, email \}\);$/,
  /^apikey: serviceRoleKey,$/,
  /^apikey: input\.serviceRoleKey,$/,
  /^authorization: `Bearer \$\{serviceRoleKey\}`,$/,
  /^authorization: `Bearer \$\{input\.serviceRoleKey\}`,$/,
  // The `configured` predicate only asks whether the key is present.
  /^return Boolean\(this\.supabaseUrl && this\.publishableKey && this\.serviceRoleKey\);$/,
  /^readonly serviceRoleKey: string;$/,
  // The environment resolver and the one-line wrapper that forwards it. Both
  // stay Node-side: `signInOnline` hands the key to `signInWithoutTheLoginForm`
  // and nowhere else.
  /^serviceRoleKey: process\.env\.ONLINE_SUPABASE_SERVICE_ROLE_KEY,$/,
  /^serviceRoleKey: onlineEnvironment\.serviceRoleKey!,$/,
];

function sourceLinesMentioning(source: string, identifier: string): readonly string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    // Comment lines are prose about the boundary, not a flow across it.
    .filter((line) => !line.startsWith("*") && !line.startsWith("//") && !line.startsWith("/*"))
    .filter((line) => line.includes(identifier));
}

function onlineSpecFiles(): readonly string[] {
  return readdirSync(e2eDirectory)
    .filter((name) => name.startsWith("online-") && name.endsWith(".spec.ts"))
    .map((name) => path.join(e2eDirectory, name));
}

describe("the online session fixture's security boundary", () => {
  it("keeps the service-role key to the admin HTTP calls it was permitted for", () => {
    const uses = sourceLinesMentioning(helper, "serviceRoleKey");
    expect(uses.length, "the helper stopped using the service role at all — did the flow change?")
      .toBeGreaterThan(0);

    const unexpected = uses.filter(
      (line) => !PERMITTED_HELPER_USES.some((permitted) => permitted.test(line)),
    );
    expect(
      unexpected,
      "a new service-role flow appeared in the online session helper; if it is legitimate, add its exact shape to PERMITTED_HELPER_USES and say why",
    ).toEqual([]);
  });

  it("never hands anything to page JavaScript", () => {
    // The helper's whole surface is HTTP plus `addCookies` plus navigation. It
    // has no reason to execute script in the page, and if it ever does, the
    // question "what did it pass?" has to be asked deliberately rather than
    // discovered later.
    const reached = BROWSER_FACING.filter((api) => sourceLinesMentioning(helper, api).length > 0);
    expect(
      reached,
      "the online session helper started using a browser-facing API; the service-role boundary must be re-argued before this is allowed",
    ).toEqual([]);
  });

  it("installs exactly one cookie, and it is the session cookie", () => {
    const cookieInstalls = sourceLinesMentioning(helper, "addCookies");
    expect(cookieInstalls).toHaveLength(1);

    // The value written into the cookie is the verified session, never the key.
    const cookieValueLines = sourceLinesMentioning(helper, "value:");
    expect(cookieValueLines).toEqual(["value: encodeSessionCookie(session),"]);
  });

  it("is not used by any online spec to put the service role into a browser", () => {
    // The specs hold the key too — they create and delete their own disposable
    // accounts. The same rule applies to them: it may sign HTTP calls and reach
    // a Supabase client constructed in Node, and it may not cross into the page.
    const offenders: string[] = [];
    for (const file of onlineSpecFiles()) {
      const source = readFileSync(file, "utf8");
      for (const line of sourceLinesMentioning(source, "serviceRoleKey")) {
        const crossesIntoTheBrowser = BROWSER_FACING.some((api) => line.includes(api))
          || line.includes("addCookies")
          || line.includes("addInitScript");
        // Reading the key back out of a browser artefact in order to assert it
        // is *absent* is the opposite of a leak, and the fixture spec does
        // exactly that.
        const isAnAbsenceAssertion = line.includes(".includes(serviceRoleKey");
        if (crossesIntoTheBrowser && !isAnAbsenceAssertion) {
          offenders.push(`${path.basename(file)}: ${line}`);
        }
      }
    }
    expect(offenders, "an online spec passes service-role material into the browser").toEqual([]);
  });
});
