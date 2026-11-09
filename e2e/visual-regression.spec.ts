import { expect, test, type Page } from "@playwright/test";

import { signInWithoutTheLoginForm } from "./support/online-session";

/**
 * Life Brain A.6 — the screenshot lane: Hoje, Conversar, Tarefas and Agenda,
 * signed in, in both themes, compared pixel by pixel with committed baselines.
 *
 * ## Where it runs, and why only there
 *
 * Against the **local** Supabase stack the CI `database` job starts, with a
 * disposable account it creates and deletes. `VISUAL_LANE=1` opts in, and the
 * spec refuses any Supabase URL that is not loopback, so it can never create an
 * account in the hosted project. Without the opt-in it skips, like every
 * credential-gated spec.
 *
 * ## Where the baselines come from
 *
 * The CI runner, never a developer's machine: font rasterization differs
 * between machines, and a baseline drawn elsewhere fails every comparison for a
 * reason that is not the product. `.github/workflows/visual-baselines.yml`
 * (dispatched by hand on a branch) runs this file with `--update-snapshots` and
 * commits the PNGs to that branch. A change that moves pixels on purpose is
 * reviewed by looking at the new PNGs in the pull request.
 *
 * ## What it proves, and what it does not
 *
 *  - PROVEN: the four surfaces of an empty account render as their baseline at
 *    Desktop Chrome and Pixel 7, light and dark — a token, a margin or a
 *    stylesheet that moved shows here.
 *  - NOT PROVEN: surfaces full of data (the account is empty), WebKit, or
 *    anything a real device adds. The day name on Hoje is masked, because it is
 *    the one thing on these pages that changes by itself; the Agenda is pinned
 *    to January 2026 for the same reason.
 *
 * ## How much difference it tolerates
 *
 * 25 pixels per image, whatever the viewport (ADR-162). The smallest removal
 * measured, one `Ctrl+K` hint, was 512 pixels; the runner's own noise is zero
 * on one day and at most a few pixels across days. A change that needs more than 25 pixels to be "the
 * same" is a change, so redraw the baselines rather than raise the number.
 */

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function isLoopback(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

const enabled = process.env.VISUAL_LANE === "1"
  && isLoopback(supabaseUrl)
  && Boolean(publishableKey && serviceRoleKey);

type Surface = {
  readonly name: string;
  readonly path: string;
  /** What changes by itself, hidden from the comparison. */
  readonly mask: readonly string[];
};

const SURFACES: readonly Surface[] = [
  { name: "hoje", path: "/pt-BR/app", mask: [".today-hero .eyebrow"] },
  { name: "conversar", path: "/pt-BR/app/chat", mask: [] },
  // `/app/tasks` redirects here. Under `app/loading.tsx` that redirect lands
  // client-side after the shell streams, so asserting the old path raced it.
  { name: "tarefas", path: "/pt-BR/app/work?view=all&page=1", mask: [] },
  { name: "agenda", path: "/pt-BR/app/calendar?date=2026-01-15&orientation=month", mask: [] },
];

const THEMES = ["light", "dark"] as const;

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test.describe("visual regression — signed-in surfaces", () => {
  test.skip(!enabled, "VISUAL_LANE=1 with a loopback Supabase is required (the CI database job).");
  test.describe.configure({ mode: "serial" });

  const email = `visual-lane-${crypto.randomUUID()}@example.test`;
  let userId: string | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, email_confirm: true, user_metadata: { display_name: "Visual" } }),
    });
    expect(response.ok, `admin create failed: ${response.status}`).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  // Fail-closed: the disposable account goes whatever the comparisons did.
  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  for (const theme of THEMES) {
    for (const surface of SURFACES) {
      test(`${surface.name} (${theme})`, async ({ page, baseURL }) => {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await signInWithoutTheLoginForm(page, {
          supabaseUrl,
          serviceRoleKey,
          publishableKey,
          email,
          locale: "pt-BR",
          appOrigin: baseURL!,
          next: surface.path,
        });
        await expect(page.locator("h1").first()).toBeVisible();
        await settle(page);
        await expect(page).toHaveScreenshot(`${surface.name}-${theme}.png`, {
          animations: "disabled",
          caret: "hide",
          mask: surface.mask.map((selector) => page.locator(selector)),
          // ADR-162. A fixed pixel count, not a ratio: the runner redraws the
          // same page identically (144 draws, 0 pixels apart), and the only
          // drift between days is the Hoje day name brushing its mask, 1-4
          // pixels. The smallest real removal measured was 512 pixels. The old
          // `maxDiffPixelRatio: 0.005` let 1,728 pixels through on mobile and
          // 4,608 on desktop, which hid every removal it was there to catch.
          maxDiffPixels: 25,
        });
      });
    }
  }
});
