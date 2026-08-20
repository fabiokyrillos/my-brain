import { expect, test, type Page } from "@playwright/test";

import { onlineEnvironment, signInOnline } from "./support/online-session";

/**
 * `/app/reviews`, with representative data — the owner's round-two finding.
 *
 * ## Why this needs seeded rows
 *
 * The two defects here are **invisible on an empty account**. A review with no
 * tasks renders no command forms, so the wall of them cannot be seen; and the
 * generated-review section reads as merely empty rather than as broken. Slice
 * 2P.8's lanes ran against empty disposable accounts and could not have found
 * either. So this one seeds tasks, entries and summaries, and deletes the
 * account afterwards.
 *
 * The seed is a **fixture** — every row is written with the service role for one
 * throwaway account, and the account is deleted in `afterAll`, which cascades.
 */

const { supabaseUrl, serviceRoleKey } = onlineEnvironment;
const onlineConfigured = onlineEnvironment.configured;

const LONG_TITLE =
  "Revisar o contrato de prestação de serviços da Aurora Participações antes da reunião de quinta-feira com o time jurídico";

async function admin(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  expect(response.ok, `${path}: ${text}`).toBe(true);
  return text ? JSON.parse(text) : [];
}

async function createAccount() {
  const email = `codex-2prev-${crypto.randomUUID()}@example.com`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password: `Rv!${crypto.randomUUID()}A7`, email_confirm: true }),
  });
  expect(response.ok, await response.clone().text()).toBe(true);
  const { id } = (await response.json()) as { id: string };
  return { email, id };
}

test.describe("the reviews page, with something in it", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  let owner: { email: string; id: string };

  test.beforeAll(async () => {
    owner = await createAccount();
    const now = new Date();
    const iso = (date: Date) => date.toISOString();
    const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

    /*
      PostgREST refuses a bulk insert whose objects do not share a key set, and
      `tasks_status_check` admits only inbox / todo / in_progress / waiting /
      blocked / deferred / completed / cancelled — there is no `open`.
    */
    const task = (over: Record<string, unknown>) => ({
      user_id: owner.id,
      title: "",
      status: "todo",
      completed_at: null,
      due_at: null,
      planned_at: null,
      ...over,
    });

    await admin("tasks", {
      method: "POST",
      body: JSON.stringify([
        task({ title: LONG_TITLE, status: "completed", completed_at: iso(now), due_at: iso(now) }),
        task({ title: "Ligar para o contador", status: "completed", completed_at: iso(now) }),
        task({ title: "Enviar a proposta revisada para a Aurora Participações", due_at: iso(now) }),
        task({ title: "Planejar a semana", planned_at: iso(now) }),
      ]),
    });

    await admin("entries", {
      method: "POST",
      body: JSON.stringify([
        {
          user_id: owner.id,
          original_content: "Conversei com a Marina sobre o cronograma. Ela vai confirmar as datas até sexta.",
          occurred_at: iso(now),
        },
      ]),
    });

    // `summaries` — the table the day review reads. `status` admits only
    // generated / edited / outdated, and `original_content` is NOT NULL.
    await admin("summaries", {
      method: "POST",
      body: JSON.stringify([
        {
          user_id: owner.id,
          period_type: "daily",
          period_start: dateOnly(now),
          period_end: dateOnly(now),
          title: "Resumo do dia",
          status: "generated",
          content: "Você fechou duas tarefas e registrou uma conversa.",
          original_content: "Você fechou duas tarefas e registrou uma conversa.",
        },
      ]),
    });
  });

  test.afterAll(async () => {
    if (!owner?.id) return;
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${owner.id}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(response.ok, "fixture teardown failed").toBe(true);
  });

  const signIn = (page: Page) => signInOnline(page, { email: owner.email, locale: "pt-BR" });

  test("the generated review is read, not reported as unreadable", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/reviews");
    await expect(page.locator(".day-review-page")).toBeVisible();

    /*
      The defect this replaces.

      `day-review-projection.ts` queried `.from("reviews")`, and **no table by
      that name has ever existed** — `information_schema` matches nothing, and
      `database.types.ts` has no such key. The real table is `summaries`, which
      the list on this same page reads correctly. So the query always errored,
      `sourceStates.generated` was always `"unavailable"`, and the page rendered
      *"Não foi possível ler: Revisão gerada"* on **every** visit — twice, once
      in the partial-read notice and once in the section itself.

      It escaped `tsc` because the client parameter was `SupabaseClient` with no
      `<Database>` generic, so the table name was checked against `any`.
    */
    const body = await page.locator(".day-review-page").innerText();
    expect(body, "the day review still reports its generated source as unreadable").not.toContain(
      "Não foi possível ler",
    );
    expect(body, "the unreadable section does not state that everything was read").toContain(
      "Todas as fontes desta revisão foram lidas",
    );

    // And the row it could not read before is now rendered.
    await expect(
      page.locator(".day-review-page").getByText("Resumo do dia").first(),
    ).toBeVisible();
  });

  test("a row's actions are one press away, not ten forms deep", async ({ page }, testInfo) => {
    await signIn(page);
    await page.goto("/pt-BR/app/reviews");
    await expect(page.locator(".day-review-page")).toBeVisible();

    /*
      Every row used to render all five command forms open. With four tasks that
      is twenty blocks: measured at **4 125px** on desktop and **14 391px** on an
      iPhone, of which the review's own content was a few lines at the top.
    */
    const disclosures = page.locator(".day-review-actions");
    expect(await disclosures.count(), "no row offers its actions").toBeGreaterThan(0);

    // Closed by default: the controls exist and are not on screen.
    expect(
      await disclosures.evaluateAll((nodes) => nodes.filter((node) => (node as HTMLDetailsElement).open).length),
      "a row's actions are open before anyone asked",
    ).toBe(0);

    // The page is a report again rather than a form stack.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, `the review page is ${height}px tall with four tasks`).toBeLessThan(
      testInfo.project.name === "desktop" ? 3200 : 10_000,
    );

    // Nothing is removed: opening one reveals the same controls, and the
    // summary is a real 44px target that the keyboard can reach.
    const first = disclosures.first();
    const summary = first.locator("summary");
    const box = await summary.boundingBox();
    expect(box!.height, `the actions summary is ${Math.round(box!.height)}px tall`).toBeGreaterThanOrEqual(44);
    await summary.click();
    await expect(first.locator(".day-review-verb").first()).toBeVisible();
  });

  test("the page's sections read as sections, and nothing scrolls sideways", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/reviews");
    await expect(page.locator(".day-review-page")).toBeVisible();

    // Each section is a bordered surface rather than a run of bold text — the
    // same treatment `.home-section` gives Hoje.
    const bare = await page.locator(".day-review-page > section").evaluateAll((sections) =>
      sections
        .filter((section) => {
          const style = getComputedStyle(section);
          return style.borderBottomStyle === "none" || parseFloat(style.borderBottomWidth) === 0;
        })
        .map((section) => section.getAttribute("aria-label") ?? section.className),
    );
    expect(bare, `sections drawn with no boundary: ${bare.join(", ")}`).toEqual([]);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the reviews page overflows by ${overflow}px`).toBeLessThanOrEqual(1);

    // The long title wraps rather than forcing width.
    await expect(page.getByText(LONG_TITLE).first()).toBeVisible();
  });
});
