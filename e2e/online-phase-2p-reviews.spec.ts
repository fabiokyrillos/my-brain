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

/**
 * Dia · Semana · Mês, and a review's own page — the redesigned experience.
 *
 * ## What only a real browser can prove here
 *
 * Everything below turns on **navigation and rendering together**: that the tab
 * is the URL and survives reload and the back button, that a review opens at its
 * own address, that stored Markdown reaches the screen as headings and lists
 * rather than as `##` and `**`, and that none of it scrolls sideways on a phone.
 * A `setContent` fixture composes markup by hand and therefore proves none of
 * those — it can only confirm that the markup it was given looks the way it was
 * written.
 *
 * The seed carries four `summaries` rows on purpose: a daily one for the running
 * day, a weekly one for the running week **written in Markdown**, and two older
 * rows so the history below has something in it that the current period does not
 * duplicate.
 */
test.describe("the reviews experience: three periods, and a page per review", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  let owner: { email: string; id: string };
  /**
   * A second account, and one review that belongs to it.
   *
   * The isolation claim is *"nem descobrir sua existência pela diferença de
   * mensagens"*, and the only way to prove a difference is absent is to have
   * both cases in hand: a review that exists and is not yours, and an id that is
   * nobody's at all.
   */
  let stranger: { email: string; id: string; reviewId: string };
  /** The stored Markdown, exactly as a generated review carries it. */
  const WEEKLY_MARKDOWN = [
    "## Revisão da semana",
    "",
    "### Entregas",
    "- **Contrato da Aurora** assinado na quinta.",
    "- Proposta revisada enviada.",
    "",
    "### Bloqueios",
    "Nenhum bloqueio registrado no período.",
  ].join("\n");

  /*
   * A hostile summary, stored the way a model could store one. It is a
   * **fixture**, not a claim about the model: the point is that whatever arrives
   * in that column reaches the screen as text.
   */
  const HOSTILE_MARKDOWN =
    '<script>window.__xss = 1</script> veja [aqui](javascript:alert(1)) e <img src=x onerror="window.__xss=1">';

  test.beforeAll(async () => {
    owner = await createAccount();
    const now = new Date();
    const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
    const shift = (days: number) => {
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() + days);
      return date;
    };
    /*
     * The Monday of the current UTC week. The product computes its window in the
     * owner's zone; a fixture only has to land inside the same week, and the
     * assertions below never compare the two dates — they read what the page
     * renders.
     */
    const monday = shift(-((now.getUTCDay() + 6) % 7));

    const summary = (over: Record<string, unknown>) => ({
      user_id: owner.id,
      status: "generated",
      content: "",
      original_content: "",
      ...over,
    });

    await admin("summaries", {
      method: "POST",
      body: JSON.stringify([
        summary({
          period_type: "daily",
          period_start: dateOnly(now),
          period_end: dateOnly(now),
          title: "Resumo diário",
          content: "## Hoje\n\n- Duas tarefas concluídas.",
          original_content: "## Hoje\n\n- Duas tarefas concluídas.",
        }),
        summary({
          period_type: "weekly_review",
          period_start: dateOnly(monday),
          period_end: dateOnly(now),
          title: "Revisão semanal",
          content: WEEKLY_MARKDOWN,
          original_content: WEEKLY_MARKDOWN,
        }),
        // Two periods that have passed, so Parte B has rows and Parte A does not
        // repeat them.
        summary({
          period_type: "weekly_review",
          period_start: dateOnly(shift(-14)),
          period_end: dateOnly(shift(-8)),
          title: "Revisão semanal",
          content: HOSTILE_MARKDOWN,
          original_content: HOSTILE_MARKDOWN,
        }),
        summary({
          period_type: "daily",
          period_start: dateOnly(shift(-3)),
          period_end: dateOnly(shift(-3)),
          title: "Resumo diário",
          content: "Um dia anterior.",
          original_content: "Um dia anterior.",
        }),
      ]),
    });

    // The stranger, and their own review. Deleted in `afterAll` like the owner.
    const other = await createAccount();
    const [strangerReview] = (await admin("summaries", {
      method: "POST",
      body: JSON.stringify([
        {
          user_id: other.id,
          period_type: "monthly",
          period_start: dateOnly(shift(-40)),
          period_end: dateOnly(shift(-35)),
          title: "Revisão mensal",
          status: "generated",
          content: "Conteúdo que pertence a outra conta.",
          original_content: "Conteúdo que pertence a outra conta.",
        },
      ]),
    })) as { id: string }[];
    stranger = { ...other, reviewId: strangerReview.id };
  });

  test.afterAll(async () => {
    for (const id of [owner?.id, stranger?.id].filter(Boolean)) {
      const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
        method: "DELETE",
        headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
      });
      expect(response.ok, "fixture teardown failed").toBe(true);
    }
  });

  const signIn = (page: Page) => signInOnline(page, { email: owner.email, locale: "pt-BR" });

  test("the three periods are the page's navigation, and the URL is what holds the choice", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/reviews");

    const tabs = page.locator(".review-tabs");
    await expect(tabs).toBeVisible();
    for (const label of ["Dia", "Semana", "Mês"]) {
      await expect(tabs.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(tabs.getByRole("link", { name: "Dia" })).toHaveAttribute("aria-current", "page");

    // Choosing a period changes the address…
    await tabs.getByRole("link", { name: "Semana" }).click();
    await expect(page).toHaveURL(/period=week/);
    await expect(page.getByRole("heading", { level: 2, name: "Esta semana" })).toBeVisible();

    // …reloading keeps it…
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: "Esta semana" })).toBeVisible();
    await expect(page.locator(".review-tabs").getByRole("link", { name: "Semana" }))
      .toHaveAttribute("aria-current", "page");

    /*
      …and so do back and forward, because there is no local state to disagree.

      The URL is waited on before the heading, and that ordering is the point: if
      history did not move, the failure says so, instead of reporting a missing
      heading twenty seconds later and leaving it ambiguous whether the page is
      wrong or the navigation never happened. WebKit reported exactly that
      ambiguity on the first run.
    */
    await page.goBack();
    await page.waitForURL((url) => !url.search.includes("period=week"));
    await expect(page.getByRole("heading", { level: 2, name: "Hoje" })).toBeVisible();
    await page.goForward();
    await page.waitForURL((url) => url.search.includes("period=week"));
    await expect(page.getByRole("heading", { level: 2, name: "Esta semana" })).toBeVisible();

    // Opening the address directly lands on the same period.
    await page.goto("/pt-BR/app/reviews?period=month");
    await expect(page.getByRole("heading", { level: 2, name: "Este mês" })).toBeVisible();
  });

  test("each period offers only the controls that write it, and its own history", async ({ page }) => {
    await signIn(page);

    await page.goto("/pt-BR/app/reviews?period=day");
    await expect(page.getByRole("button", { name: /Resumo do dia/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Revisão do mês/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Dias anteriores" })).toBeVisible();

    // A week carries two kinds of review, so it offers two controls.
    await page.goto("/pt-BR/app/reviews?period=week");
    await expect(page.getByRole("button", { name: /Revisão da semana/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Planejar a semana/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Semanas anteriores" })).toBeVisible();
  });

  test("the running period is shown once, above a history that does not repeat it", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/reviews?period=week");

    // Parte A holds this week's review…
    const current = page.locator(".day-review-generated");
    await expect(current.getByRole("link", { name: "Abrir revisão" })).toHaveCount(1);
    const currentHref = await current.getByRole("link", { name: "Abrir revisão" }).getAttribute("href");

    // …and Parte B holds only the older one.
    const history = page.locator(".review-history-list");
    await expect(history.locator("li")).toHaveCount(1);
    const historyHref = await history.getByRole("link", { name: "Abrir revisão" }).getAttribute("href");
    expect(historyHref, "the same review is listed twice on one screen").not.toBe(currentHref);

    // The listing discloses nothing: no reveal control, no masked stub, no prose.
    await expect(history.getByRole("button", { name: "Mostrar resumo" })).toHaveCount(0);
    await expect(history.locator("[data-masked]")).toHaveCount(0);
    expect(await history.innerText()).not.toContain("Contrato da Aurora");
  });

  test("a review opens at its own address and renders as prose, never as Markdown source", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/reviews?period=week");
    await page.locator(".day-review-generated").getByRole("link", { name: "Abrir revisão" }).click();

    await expect(page).toHaveURL(/\/pt-BR\/app\/reviews\/[0-9a-f-]{36}$/);
    const address = page.url();
    await expect(page.getByRole("heading", { level: 1, name: "Revisão semanal" })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);

    // Masked until asked for — `summaries` carries no classification, so the
    // surface treats every summary as sensitive.
    await expect(page.locator('[data-masked="true"]')).toBeVisible();
    await page.getByRole("button", { name: "Mostrar resumo" }).click();

    const content = page.locator(".review-content");
    await expect(content).toBeVisible();
    await expect(content.getByRole("heading", { name: "Revisão da semana" })).toBeVisible();
    await expect(content.getByRole("heading", { name: "Entregas" })).toBeVisible();
    await expect(content.locator("li")).toHaveCount(2);
    await expect(content.locator("strong").first()).toHaveText("Contrato da Aurora");

    const rendered = await content.innerText();
    expect(rendered, "the stored markers reached the screen").not.toContain("##");
    expect(rendered, "the stored markers reached the screen").not.toContain("**");

    // The address works on its own, and reload keeps it.
    await page.goto(address);
    await expect(page.getByRole("heading", { level: 1, name: "Revisão semanal" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/period=week/);
  });

  test("a hostile summary reaches the screen as text, with no element and no script", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/reviews?period=week");
    await page.locator(".review-history-list").getByRole("link", { name: "Abrir revisão" }).click();
    await page.getByRole("button", { name: "Mostrar resumo" }).click();

    const content = page.locator(".review-content");
    await expect(content).toBeVisible();
    await expect(content.locator("script")).toHaveCount(0);
    await expect(content.locator("img")).toHaveCount(0);
    // No link at all: `summaries` carries no verified identifier, so the page
    // vouches for nothing and every href in the content degrades to its words.
    await expect(content.locator("a")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    // …and the words survive, so nothing was silently deleted from the report.
    expect(await content.innerText()).toContain("aqui");
  });

  test("a review's own page reaches its period and its tab, and nothing else", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/reviews?period=week");
    await page.locator(".day-review-generated").getByRole("link", { name: "Abrir revisão" }).click();

    await expect(page.getByRole("link", { name: "Voltar para Revisões" })).toHaveAttribute(
      "href",
      "/pt-BR/app/reviews?period=week",
    );
    const calendar = page.getByRole("link", { name: "Ver este período no calendário" });
    await expect(calendar).toHaveAttribute("href", /\/app\/calendar\?date=\d{4}-\d{2}-\d{2}/);
    await expect(calendar).toHaveAttribute("href", /orientation=week/);

    // The running period may be regenerated; a past one says why it may not.
    await expect(page.getByRole("button", { name: /Revisão da semana/ })).toBeVisible();
  });

  test("a review belonging to another account is indistinguishable from one that never existed", async ({ page }) => {
    await signIn(page);

    /*
      The status code is deliberately NOT the assertion, and the Next.js docs are
      why: `not-found.md` states that Next returns **200 for streamed responses
      and 404 for non-streamed ones**, because "the response headers have already
      been sent to the client, the status code of the response cannot be
      updated". This route streams, so it answers 200 — a rendering-mode fact,
      not a security one, and asserting it would make this test fail the day a
      sibling route started or stopped streaming.

      What the requirement actually asks is that a person cannot "descobrir sua
      existência pela diferença de mensagens". So the two cases are fetched and
      **compared to each other**: a review that really exists and is not the
      reader's, and an id that is nobody's at all.
    */
    const read = async (id: string) => {
      await page.goto(`/pt-BR/app/reviews/${id}`);
      /*
        Settled on the placeholder being GONE, not on some element being
        visible.

        `loading.tsx` renders `<main role="status" class="route-loading">`,
        so while the route streams there are two `<main>` elements on the
        page — which is both why a `main, body` locator was a strict-mode
        violation and why a measurement taken here reads the placeholder
        rather than the answer.
      */
      await expect(page.locator(".route-loading")).toHaveCount(0);
      return {
        // Next injects this on every not-found render. It is the POSITIVE marker
        // that the not-found path was actually taken — without it the absence
        // assertions below would pass just as well over a blank page or an error
        // boundary, which is the trap this repository has already recorded.
        noindex: await page.locator('meta[name="robots"][content*="noindex"]').count(),
        heading: await page.locator("h1").allInnerTexts(),
        content: await page.locator(".review-content, [data-masked]").count(),
      };
    };

    const foreign = await read(stranger.reviewId);
    const missing = await read("00000000-0000-0000-0000-000000000000");

    // Both took the not-found path…
    expect(foreign.noindex, "the foreign review did not render as not-found").toBeGreaterThan(0);
    expect(missing.noindex, "the missing review did not render as not-found").toBeGreaterThan(0);
    // …neither rendered any part of a review…
    expect(foreign.content).toBe(0);
    expect(missing.content).toBe(0);
    // …and the two are the same page, which is the property itself.
    expect(foreign.heading, "a foreign review reads differently from a missing one")
      .toEqual(missing.heading);

    // The control: the reader's OWN review must render, or every check above
    // passes because this route shows nothing to anybody.
    await page.goto("/pt-BR/app/reviews?period=week");
    await page.locator(".day-review-generated").getByRole("link", { name: /Abrir revisão/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Revisão semanal" })).toBeVisible();
    expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBe(0);
  });

  test("neither page scrolls sideways, and every control is a comfortable target", async ({ page }, testInfo) => {
    await signIn(page);

    for (const address of ["/pt-BR/app/reviews?period=week", "/pt-BR/app/reviews?period=month"]) {
      await page.goto(address);
      /*
        Waited on before ANY measurement is taken.

        `page.goto` resolves on `load`, and App Router streams: the placeholder
        from `loading.tsx` can still be on screen, or the real markup can be
        present but not yet laid out. Measuring at that instant returns zeroes —
        which is exactly what this lane reported on Pixel 7, as "a period control
        is 0px tall". This repository has already paid for the same lesson once,
        on the mobile navigation depth measurement.
      */
      await expect(page.locator(".review-tabs")).toBeVisible();
      await expect(page.locator(".review-tab").first()).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${address} overflows by ${overflow}px`).toBeLessThanOrEqual(1);

      // The three tabs fit without squeezing, at every viewport.
      const boxes = await page.locator(".review-tab").evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().height));
      expect(boxes.length, "the tab strip is missing").toBe(3);
      for (const height of boxes) {
        expect(Math.round(height), `a period control is ${Math.round(height)}px tall`).toBeGreaterThanOrEqual(44);
      }
    }

    // And the review's own page, where the long content lives.
    await page.goto("/pt-BR/app/reviews?period=week");
    await page.locator(".day-review-generated").getByRole("link", { name: /Abrir revisão/ }).click();
    await page.getByRole("button", { name: "Mostrar resumo" }).click();
    await expect(page.locator(".review-content")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the review page overflows by ${overflow}px on ${testInfo.project.name}`).toBeLessThanOrEqual(1);

    // Nothing touches the edge.
    const inset = await page.locator(".review-content").evaluate((node) => node.getBoundingClientRect().left);
    expect(inset, "the content is flush against the viewport edge").toBeGreaterThanOrEqual(12);
  });
});
