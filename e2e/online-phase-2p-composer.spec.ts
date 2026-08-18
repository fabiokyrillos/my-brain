import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

import { onlineEnvironment, signInOnline } from "./support/online-session";

const require_ = createRequire(__filename);
const AXE_PATH = require_.resolve("axe-core");

/**
 * Serious and critical only, on the real document — the same threshold and the
 * same reasoning `2O-ACCESS-001` uses. `region` stays enabled because this
 * renders the shipped page chrome rather than a fixture.
 */
async function axeViolations(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    // @ts-expect-error injected by addScriptTag
    const results = await window.axe.run(document, { resultTypes: ["violations"] });
    return (results.violations as Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown }> }>)
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.slice(0, 3).map((node) => String(node.target)),
      }));
  });
}

/**
 * `2P-CAPTURE-001` … `2P-CAPTURE-005`, on the two pages that actually mount it.
 *
 * ## Why this lane exists at all
 *
 * `composer.test.tsx` renders the component. It cannot render the **pages**,
 * and the pages are where this slice's specific risk lives: `Composer` is a
 * Client Component that now receives *three* Server Actions from two different
 * Server Components, one of which (`home-dashboard.tsx`) previously imported
 * only one. A bad boundary there does not fail `tsc`, does not fail `vitest`,
 * and does not fail `next build` — it fails at request time, on the deployed
 * app, with a blank surface. That exact defect shipped twice in this project
 * and is recorded as "the RSC boundary is only tested in production".
 *
 * The CI journey lane cannot cover it either: every spec it runs is either
 * unauthenticated or renders its own fixture markup, and `/app` and
 * `/app/capture` are behind a session.
 *
 * ## What it deliberately does not do
 *
 * **It sends nothing.** A capture would enqueue `interpret_entry`, the worker
 * would call the provider, and that is the owner's BYOK credential being spent
 * on a proof nobody authorized — the single authorized paid call in Phase 2P is
 * one Conversation turn in slice 2P.8. So this lane reads. It creates no entry,
 * no attachment, no job and no product event beyond the page views the app
 * records for itself, which means it also has no residue to clean up.
 *
 * Runs against whatever `baseURL` the project carries — a local `next start`
 * over the hosted Supabase is the intended shape. Skips itself without
 * credentials. `--workers=1` is a hard requirement: GoTrue issues one magiclink
 * OTP per user.
 */

const EMAIL = process.env.ONLINE_AUTH_TEST_EMAIL ?? "";

/** The two surfaces `2P-CAPTURE-001` requires to mount one contract. */
const SURFACES = [
  { route: "/pt-BR/app", name: "Hoje" },
  { route: "/pt-BR/app/capture", name: "Captura" },
] as const;

test.describe("2P-CAPTURE: one composer, on both surfaces that mount it", () => {
  test.skip(!onlineEnvironment.configured || !EMAIL, "linked Supabase credentials or ONLINE_AUTH_TEST_EMAIL absent");
  test.describe.configure({ mode: "serial" });

  test("both surfaces render the same composer, with no modality choice first", async ({ page }, testInfo) => {
    testInfo.setTimeout(10 * 60_000);
    await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

    for (const surface of SURFACES) {
      await page.goto(surface.route);

      /*
        The RSC assertion, and it has to come first. A surface that failed to
        serialize renders the error boundary or nothing at all, and every
        assertion below would then be checking an absence against a page that
        never drew -- the shape recorded as "a test that cannot fail on a blank
        page". So the composer's own field is proved PRESENT before anything is
        proved absent.
      */
      const composer = page.locator(".composer");
      await expect(composer, `${surface.name} did not render a composer`).toHaveCount(1);
      await expect(page.getByRole("textbox", { name: "Nova entrada" })).toBeVisible();

      // `2P-CAPTURE-002`. Text is ready; nothing is chosen first.
      await expect(composer.locator('[role="tablist"], [role="tab"]')).toHaveCount(0);

      // `2P-CAPTURE-003` / `2P-CAPTURE-004`. Both controls are on the surface,
      // and the file input belongs to a form that is NOT the entry form.
      await expect(composer.getByLabel("Anexar arquivo")).toBeVisible();
      await expect(composer.getByRole("button", { name: /^Gravar/ })).toBeVisible();

      const separateOwners = await composer.evaluate((root) => {
        const file = root.querySelector<HTMLInputElement>('input[type="file"]');
        const entry = root.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
        if (file === null || entry === null) return "a control is missing";
        if (file.form === null || entry.form === null) return "a control has no form owner";
        return file.form === entry.form ? "one form owns both" : "separate";
      });
      expect(separateOwners, `${surface.name}: T-1`).toBe("separate");
    }
  });

  test("the surfaces keep separate drafts, which is what makes one contract safe", async ({ page }, testInfo) => {
    testInfo.setTimeout(10 * 60_000);
    await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

    const typed = "rascunho 2P.3 — nao enviado";
    await page.goto("/pt-BR/app/capture");
    await page.getByRole("textbox", { name: "Nova entrada" }).fill(typed);
    // `2O-RECOVER-006`: the note only appears once there is something to keep.
    await expect(page.locator("[data-composer-draft='kept']")).toBeVisible();

    // The cockpit must not be holding the capture page's half-written text.
    await page.goto("/pt-BR/app");
    await expect(page.getByRole("textbox", { name: "Nova entrada" })).toHaveValue("");

    // And coming back must still have it, which is the requirement's whole point.
    await page.goto("/pt-BR/app/capture");
    await expect(page.getByRole("textbox", { name: "Nova entrada" })).toHaveValue(typed);

    /*
      Cleaned up through the product's own control rather than by clearing
      storage: the draft lives in `sessionStorage` and would die with the
      context anyway, but discarding it here proves the discard works AND
      leaves nothing behind for a rerun to trip over.
    */
    await page.getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByRole("textbox", { name: "Nova entrada" })).toHaveValue("");
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Nova entrada" })).toHaveValue("");
  });

  test("nothing is sent by attaching a file or by opening the recorder", async ({ page }, testInfo) => {
    testInfo.setTimeout(10 * 60_000);
    await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });
    await page.goto("/pt-BR/app/capture");

    /*
      `2P-CAPTURE-008`, proved on the wire rather than in the DOM.

      The claim is narrow and so is the detector: **no request carried a file**.
      "No POST at all" was the first draft and it was wrong — every Server
      Action is a POST to the current route, and the composer legitimately makes
      one the moment a file is chosen, because that is `capture_mode_selected`
      being re-wired by this very slice. Asserting the absence of all POSTs
      would have failed on the feature working.

      A form carrying a file is `multipart/form-data`; a Server Action call
      carrying an enum is not. So the content type is what separates "the owner
      picked a file" from "the file left the browser".
    */
    const posts: { url: string; contentType: string }[] = [];
    page.on("request", (request) => {
      if (request.method() !== "POST") return;
      posts.push({ url: request.url(), contentType: request.headers()["content-type"] ?? "" });
    });

    await page.setInputFiles('.composer input[type="file"]', {
      name: "nota-2p3.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("uma nota curta"),
    });

    // The chip names the file and offers the upload as a separate, explicit act.
    await expect(page.getByText("nota-2p3.txt")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar arquivo" })).toBeVisible();

    /*
      The detector's liveness control, and it does double duty. If choosing a
      file produced no request at all, the multipart assertion below would pass
      over an empty list and prove nothing. It is not empty — and what fills it
      is the re-wired modality event reaching the server from the real page,
      which is the half of this slice no unit test can observe.
    */
    await expect
      .poll(() => posts.length, { message: "no request was observed, so the file check would be vacuous" })
      .toBeGreaterThan(0);
    expect(
      posts.filter((post) => post.contentType.includes("multipart/form-data")),
      "choosing a file must not send it",
    ).toEqual([]);

    // Removing it leaves the composer exactly as it was, and still sends nothing.
    await page.getByRole("button", { name: "Remover anexo" }).click();
    await expect(page.getByText("nota-2p3.txt")).toHaveCount(0);
    expect(
      posts.filter((post) => post.contentType.includes("multipart/form-data")),
      "removing a file must not send anything either",
    ).toEqual([]);
    // The consequence, read off the page: an upload that had happened would
    // have replaced the chip with its own feedback line.
    await expect(page.locator(".composer-attachment-sent")).toHaveCount(0);
  });

  test("the rebuilt composer introduces no serious or critical accessibility violation", async ({ page }, testInfo) => {
    testInfo.setTimeout(10 * 60_000);
    await signInOnline(page, { email: EMAIL, locale: "pt-BR", appOrigin: testInfo.project.use.baseURL });

    /*
      This slice replaced the modality tab strip's stylesheet with the
      composer's, added an icon-only attachment control and an icon-only
      microphone, and styled two elements that had shipped with no rule at all.
      Every one of those is a way to lose contrast or an accessible name, and
      none of them is visible to jsdom — a component test renders no colours
      and resolves no cascade. So the scan runs on the rendered page, on both
      surfaces, because they now draw the same controls in different chrome.
    */
    for (const surface of SURFACES) {
      await page.goto(surface.route);
      await expect(page.locator(".composer")).toHaveCount(1);
      // The recording controls are a second, transient state of the same row,
      // so the idle scan below would never reach them. They are NOT scanned
      // here: reaching them needs a microphone permission this lane has no way
      // to grant, and that limit is recorded rather than papered over.
      expect(await axeViolations(page), `${surface.name}`).toEqual([]);
    }
  });
});
