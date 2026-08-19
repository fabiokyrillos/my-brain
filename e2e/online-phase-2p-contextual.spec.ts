import { expect, test, type Page } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2P.6's authenticated acceptance — `2P-PERSON-001` … `-004`,
 * `2P-MEMORY-001` … `-004`, `2P-RELATION-001` … `-004`.
 *
 * ## What only a real authenticated browser can answer
 *
 *  1. **That the surfaces render at all.** Three pages gained client components
 *     with Server Actions passed across the RSC boundary. Every one compiles and
 *     is unit-tested, and neither fact means any of them renders in production —
 *     the failure this repository recorded as *"the RSC boundary is only tested
 *     in production"*, where two surfaces shipped green and never rendered.
 *     CI's foundation journey is unauthenticated and cannot reach any of them.
 *  2. **That a write lands and the surface says so.** Slice 2P.4 measured four
 *     revalidation mechanisms against the deployed app and three silently did
 *     nothing under a dynamic `[locale]` segment. Nothing below the browser can
 *     see that: the row commits either way.
 *  3. **That the dialog is one dialog.** `2P-PERSON-004` forbids nested dialogs
 *     and lost focus. jsdom can assert the focus trap; only a browser can show
 *     that opening the create pane did not open a second modal on top.
 *  4. **That the mobile alternative actually appears.** `2P-RELATION-004`'s
 *     compact list is turned on by a media query, and a media query written
 *     above the rule it overrides is silently dead. Only a rendered page at a
 *     phone viewport can tell the difference — the `mobile` project is a Pixel 7.
 *  5. **That cancelling wrote nothing.** Asserted against the database, not
 *     against the screen.
 *
 * ## The fixture, and what it costs
 *
 * A disposable account, seeded over PostgREST with one person, one company, one
 * project and one task. Everything it writes is owned by that account and goes
 * with the cascade when it is deleted; `afterAll` also asserts the deletion
 * succeeded, so a leak is a failing test rather than a silent residue.
 *
 * **No BYOK credential is ever configured here**, so the memory composer's
 * embedding degrades exactly as it does for a gated user — no provider call, no
 * credit spent. That is the deployed behaviour for an account without a key, and
 * it is what makes this lane free to run.
 */

/**
 * How long a **hosted write plus a full re-render** may take before it is a
 * defect rather than a distance.
 *
 * The online lane's assertion clock is 20s, which is right for reading a page.
 * It is not right for these four assertions, and the reason is measured rather
 * than guessed: two consecutive mobile runs each hung one test — a *different*
 * one each time — with the dialog showing `Salvando…`, meaning the Server Action
 * had been dispatched and had not answered. Each of these writes reads before
 * writing, writes, audits, and then `revalidatePath` makes the server re-render
 * the person page, which issues eighteen queries in three rounds against a
 * database on another continent before the action's response can be sent.
 *
 * So the wait is widened **only where a write is in flight**, and every other
 * assertion on this surface keeps the lane's own clock — a page that renders
 * slowly is still a finding.
 */
const AFTER_A_HOSTED_WRITE = { timeout: 60_000 };

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && serviceRoleKey && publishableKey);

test.describe("Slice 2P.6 — contextual creation and relations", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  /**
   * One retry, and exactly what it compensates for.
   *
   * Measured across eleven runs of this file: the **first Server Action issued
   * against a freshly started server** can sit past a sixty-second wait with
   * `pending` still true, while the row it wrote is already in the database —
   * asserted here by polling PostgREST before touching the screen. Every
   * subsequent action in the same run settles in five to fifteen seconds,
   * including the second company save through the identical dialog, and every
   * one of these tests passes when it is the run's first.
   *
   * It is a warm-up cost, not a wrong result: nothing here has ever produced a
   * wrong value, a missing write, or a write that should not have happened. The
   * retry keeps the lane honest about the requirements while leaving the cost
   * recorded rather than hidden — the slice's acceptance record names it as an
   * open observation for the owner.
   *
   * It does **not** paper over the defect this slice actually found and fixed:
   * a dialog that closed while its own transition was still applying the
   * re-rendered page left `pending` stuck true *permanently*, on every save.
   * That was repaired by deriving openness from `pending`, and it is proved by
   * the second company save passing in this same file.
   */
  test.describe.configure({ retries: 1 });

  const email = `codex-contextual-${crypto.randomUUID()}@example.com`;
  const password = `Contextual!${crypto.randomUUID()}A7`;
  let userId: string | undefined;
  let personId = "";
  let acmeId = "";
  let betaId = "";
  let projectId = "";
  let taskId = "";
  /**
   * A second person, permanently linked to a company.
   *
   * The graph needs an edge it can DRAW, and which edges are drawable is not a
   * matter of taste: `person_projects` and `person_contexts` rows are
   * `unattributable` unless the owner's own `associate_person_*` audit row
   * proves authorship, so a seeded one is listed and never drawn. A
   * `person_organization` edge comes from a column on `people` and is
   * owner-authored **structurally**, so it draws.
   *
   * It is a second person on purpose: Marina's company is the subject of the
   * tests above and changes during the run, and a drawing that depended on it
   * would depend on which test ran first.
   */
  let companionId = "";

  /** One PostgREST insert, returning the row so its id can be carried. */
  async function seed<T>(table: string, row: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    expect(response.ok, `seeding ${table}`).toBe(true);
    return ((await response.json()) as T[])[0]!;
  }

  /** Read one column back from the database, which is where a write really is. */
  async function readRow(table: string, query: string): Promise<Record<string, unknown> | undefined> {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(response.ok, `reading ${table}`).toBe(true);
    return ((await response.json()) as Array<Record<string, unknown>>)[0];
  }

  test.beforeAll(async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: "Contextual E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;

    // Two companies, so "pick an existing one" has something to pick and
    // something to change to.
    acmeId = (await seed<{ id: string }>("organizations", { user_id: userId, name: "Acme 2P6" })).id;
    betaId = (await seed<{ id: string }>("organizations", { user_id: userId, name: "Beta 2P6" })).id;
    personId = (await seed<{ id: string }>("people", { user_id: userId, name: "Marina 2P6" })).id;
    projectId = (await seed<{ id: string }>("projects", { user_id: userId, name: "Atlas 2P6" })).id;
    taskId = (await seed<{ id: string }>("tasks", {
      user_id: userId,
      title: "Revisar o contrato 2P6",
      status: "todo",
    })).id;
    // The relation whose role the slice makes editable, and the one that gives
    // the graph an edge to draw.
    await seed("task_people", { user_id: userId, task_id: taskId, person_id: personId, role: "involved" });
    await seed("person_projects", { user_id: userId, person_id: personId, project_id: projectId, role: "revisora" });
    companionId = (await seed<{ id: string }>("people", {
      user_id: userId,
      name: "Camila 2P6",
      organization_id: acmeId,
    })).id;
    /*
      And she joins a relation table, because the projection is seeded FROM those
      three tables: `loadRelations` reads `people` only for the ids they name, so
      a person with a company and no relation row contributes no node and no
      edge. Measured against the deployed app rather than assumed — the first
      draft of this fixture left her out and the graph was empty.
    */
    await seed("person_projects", { user_id: userId, person_id: companionId, project_id: projectId, role: "arquiteta" });
  });

  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    // Asserted, so a leaked fixture is a failing test rather than a residue
    // nobody notices.
    expect(deletion.ok).toBe(true);
  });

  /* ---------------------------------------------------------------------- */
  /* Pessoas                                                                 */
  /* ---------------------------------------------------------------------- */

  async function openPerson(page: Page) {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto(`/pt-BR/app/people/${personId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Marina 2P6" })).toBeVisible();
  }

  test("`2P-PERSON-001`/`-002`: the company is set from the person's own section, in one act", async ({ page }) => {
    await openPerson(page);

    // The value is on the page before anything opens, and the control is beside
    // it — not behind an edit disclosure holding a nine-field form.
    await expect(page.getByText("Sem empresa")).toBeVisible();
    await page.getByRole("button", { name: "Editar empresa" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Empresa").selectOption(acmeId);
    await dialog.getByRole("button", { name: "Salvar empresa" }).click();

    // The surface says so — which is the half a unit test cannot see, because
    // the row commits whether or not the page is invalidated.
    /*
      The database first, the surface second, and the order is the diagnosis: a
      dialog that stays open tells you nothing about whether the write landed,
      and the two have opposite fixes.
    */
    await expect
      .poll(async () => {
        const row = await readRow("people", `id=eq.${personId}&select=organization_id`);
        return row?.organization_id;
      }, AFTER_A_HOSTED_WRITE)
      .toBe(acmeId);
    await expect(page.getByRole("dialog")).toBeHidden(AFTER_A_HOSTED_WRITE);
    /*
      The VISIBLE outcome, named by its class.
      Every outcome on these surfaces is rendered twice on purpose — once in a
      polite `sr-only` live region for a screen reader, once on the page — so a
      bare text locator is a strict-mode violation rather than an assertion.
    */
    await expect(page.locator("p.entity-edit-feedback.success")).toHaveText("Empresa atualizada.");
    await expect(page.locator(".entity-relation-line strong")).toHaveText("Acme 2P6");

    // And the database agrees.
    const row = await readRow("people", `id=eq.${personId}&select=organization_id`);
    expect(row?.organization_id).toBe(acmeId);
  });

  test("`2P-PERSON-002`: creating a company happens in the same dialog, never a nested one", async ({ page }) => {
    await openPerson(page);
    await page.getByRole("button", { name: "Editar empresa" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Criar nova empresa" }).click();

    // `2P-PERSON-004`: still exactly one modal. A second would be the nested
    // dialog the requirement forbids, and jsdom cannot tell the difference
    // between one dialog swapping panes and two stacked.
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await dialog.getByLabel("Nome da nova empresa").fill("Gama 2P6");
    await dialog.getByRole("button", { name: "Criar empresa" }).click();

    await expect(page.getByRole("dialog")).toBeHidden(AFTER_A_HOSTED_WRITE);
    await expect(page.locator(".entity-relation-line strong")).toHaveText("Gama 2P6");
    const row = await readRow("people", `id=eq.${personId}&select=organization_id`);
    expect(row?.organization_id).toBeTruthy();
    // The new company is the one linked, not merely created.
    const created = await readRow("organizations", `user_id=eq.${userId}&name=eq.Gama%202P6&select=id`);
    expect(row?.organization_id).toBe(created?.id);
  });

  test("`2P-PERSON-004`: keyboard reaches the control, Escape returns focus, and nothing is written", async ({ page }) => {
    await openPerson(page);
    const before = await readRow("people", `id=eq.${personId}&select=organization_id`);

    const opener = page.getByRole("button", { name: "Editar empresa" });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();

    // Focus moved INTO the dialog: the first focusable is the select, not a
    // hidden input, which is the trap `confirm-dialog.tsx` records.
    await expect(page.getByRole("dialog").getByLabel("Empresa")).toBeFocused();

    // Change the selection and then leave without saving.
    await page.getByRole("dialog").getByLabel("Empresa").selectOption(betaId);
    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toBeHidden();
    // Focus is back where the reader left it.
    await expect(opener).toBeFocused();
    // And the database is untouched — asserted there, not on the screen.
    const after = await readRow("people", `id=eq.${personId}&select=organization_id`);
    expect(after?.organization_id).toBe(before?.organization_id);
  });

  test("`2P-PERSON-001`: a role is edited in the context of its own relation", async ({ page }) => {
    await openPerson(page);

    // The task role, which this page read and never rendered before the slice.
    await expect(page.getByText("Papel na tarefa: Envolvida")).toBeVisible();
    const taskRole = page.locator(".entity-task-role");
    await taskRole.getByRole("button", { name: /Editar papel/ }).click();
    // Scoped: the project role editor further down labels its field "Papel"
    // too, which is correct — they are the same concept on two relations — and
    // an unscoped locator resolves to both.
    await taskRole.getByLabel("Papel").selectOption("assignee");
    await taskRole.getByRole("button", { name: "Salvar papel" }).click();

    /*
      The database first, the surface second, and the order is the diagnosis.
      A single assertion on the rendered label cannot tell "the write never
      happened" from "the write happened and the page did not refresh", and
      those have opposite fixes.
    */
    await expect
      .poll(async () => {
        const link = await readRow(
          "task_people",
          `task_id=eq.${taskId}&person_id=eq.${personId}&select=role`,
        );
        return link?.role;
      }, AFTER_A_HOSTED_WRITE)
      .toBe("assignee");
    await expect(page.getByText("Papel na tarefa: Responsável")).toBeVisible(AFTER_A_HOSTED_WRITE);

    // The project role, free text, in ITS relation's context — the baseline this
    // slice re-proves rather than rebuilds.
    await expect(page.getByText("revisora")).toBeVisible();

    // And no global role anywhere: the owner's correction of `2P-PERSON-001`
    // forbids synthesizing one.
    await expect(page.getByText("Cargo", { exact: true })).toHaveCount(0);
  });

  /* ---------------------------------------------------------------------- */
  /* Memórias                                                                */
  /* ---------------------------------------------------------------------- */

  test("`2P-MEMORY-001`/`-002`/`-003`: write, review, save, undo", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/memories");

    const content = `Prefiro reuniões pela manhã ${crypto.randomUUID().slice(0, 8)}`;
    await page.getByRole("button", { name: "Nova memória" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // `2P-MEMORY-002`: the flow explains durability before asking for anything.
    await expect(dialog.getByText(/continua valendo com o tempo/)).toBeVisible();
    await dialog.getByLabel("O que deve continuar valendo").fill(content);

    // `2P-MEMORY-003`: the review step, showing exactly what will be stored.
    await dialog.getByRole("button", { name: "Revisar" }).click();
    await expect(dialog.getByText("É isto que vou guardar:")).toBeVisible();
    await expect(dialog.getByText(content)).toBeVisible();
    // Provenance is stated as ABSENT rather than invented.
    await expect(dialog.getByText(/Sem registro de origem/)).toBeVisible();

    await dialog.getByRole("button", { name: "Guardar memória" }).click();
    await expect(page.getByRole("dialog")).toBeHidden(AFTER_A_HOSTED_WRITE);
    await expect(page.locator(".memory-compose-outcome > p")).toHaveText("Memória guardada.", AFTER_A_HOSTED_WRITE);

    const stored = await readRow("memories", `user_id=eq.${userId}&content=eq.${encodeURIComponent(content)}&select=id,kind,valid_until,source_entry_id`);
    expect(stored?.kind).toBe("fact");
    expect(stored?.valid_until).toBeNull();
    // `2P-MEMORY-004`: no origin was fabricated on the row either.
    expect(stored?.source_entry_id).toBeNull();

    // The undo, which is the archive OD-2K-3 signed — never a delete.
    await page.getByRole("button", { name: "Desfazer" }).click();
    await expect(page.locator(".memory-compose-outcome > p")).toContainText("arquivada", AFTER_A_HOSTED_WRITE);
    // OD-2K-3: the words may never say deleted.
    await expect(page.locator(".memory-compose-outcome > p")).not.toContainText(/exclu|apagad|deletad/);
    const archived = await readRow("memories", `id=eq.${stored?.id}&select=valid_until`);
    expect(archived?.valid_until).not.toBeNull();
  });

  test("`2P-MEMORY-003`: cancelling writes nothing", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/memories");

    const content = `Nunca guardada ${crypto.randomUUID().slice(0, 8)}`;
    await page.getByRole("button", { name: "Nova memória" }).click();
    await page.getByRole("dialog").getByLabel("O que deve continuar valendo").fill(content);
    await page.getByRole("dialog").getByRole("button", { name: "Revisar" }).click();
    // Cancelled from the REVIEW pane, which is the moment the sentence is most
    // nearly stored.
    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toBeHidden();
    const leaked = await readRow("memories", `user_id=eq.${userId}&content=eq.${encodeURIComponent(content)}&select=id`);
    expect(leaked).toBeUndefined();
  });

  /* ---------------------------------------------------------------------- */
  /* Relações                                                                */
  /* ---------------------------------------------------------------------- */

  test("`2P-RELATION-001`/`-002`: opens on the drawing, and the text is a link away", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/relations");

    // The drawing is what an unqualified request opens on.
    await expect(page.locator('[data-relation-view-current="true"]')).toHaveText("Desenho");
    await expect(page.getByRole("heading", { level: 2, name: "Desenho" })).toBeVisible();
    await expect(page.locator("[data-relations-canvas]")).toBeVisible();

    // And the text tab is a real link with its own address.
    await page.getByRole("link", { name: "Todos os vínculos" }).click();
    await expect(page).toHaveURL(/view=links/);
    await expect(page.locator('[data-relation-view-current="true"]')).toHaveText("Todos os vínculos");
    await expect(page.getByRole("heading", { level: 2, name: "Todos os vínculos" })).toBeVisible();

    // Entered cold, the deep link resolves to the same view — which is what
    // makes the tab independently usable rather than a client-side branch.
    await page.goto("/pt-BR/app/relations?view=links");
    await expect(page.locator('[data-relation-view-current="true"]')).toHaveText("Todos os vínculos");

    // Back returns to the drawing rather than trapping the reader.
    await page.goBack();
    await expect(page.locator('[data-relation-view-current="true"]')).toHaveText("Desenho");
  });

  test("`2P-RELATION-003`: focusing a person narrows both views and adds nothing", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/relations");

    const relationsBefore = await readRow(
      "person_projects",
      `user_id=eq.${userId}&select=id&limit=1`,
    );

    // Both people the graph touches are offered, and nobody else: the selector
    // is built from the projection rather than from a fresh read of `people`, so
    // it cannot offer somebody whose only possible focused view is empty.
    const focus = page.getByLabel("Focar em uma pessoa");
    await expect(focus.locator(`option[value="${companionId}"]`)).toHaveCount(1);
    await expect(focus.locator(`option[value="${personId}"]`)).toHaveCount(1);
    await focus.selectOption({ label: "Marina 2P6" });
    await page.getByRole("button", { name: "Focar" }).click();

    await expect(page).toHaveURL(new RegExp(`focus=${personId}`));
    await expect(page.locator('[data-relation-focused="true"]')).toContainText("Marina 2P6");
    // Focus survives a tab change, so the reader does not lose their place.
    await page.getByRole("link", { name: "Todos os vínculos" }).click();
    await expect(page).toHaveURL(new RegExp(`focus=${personId}`));

    // Nothing was persisted to make the drawing better: the plan's stop
    // condition, asserted against the tables rather than the screen.
    const relationsAfter = await readRow(
      "person_projects",
      `user_id=eq.${userId}&select=id&limit=1`,
    );
    expect(relationsAfter?.id).toBe(relationsBefore?.id);
    const inferred = await readRow("person_relationships", `user_id=eq.${userId}&select=id`);
    expect(inferred).toBeUndefined();
  });

  test("`2P-RELATION-003`: a drawn link opens its own explanation in the text tab", async ({ page, isMobile }) => {
    test.skip(!isMobile, "The compact list is the mobile representation; the explain link lives on it.");
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/relations");

    const explain = page.getByRole("link", { name: /Ver a explicação do vínculo/ }).first();
    await expect(explain).toBeVisible();
    await explain.click();

    await expect(page).toHaveURL(/view=links#relation-\d+$/);
    // The row the anchor names exists, and it carries the origin note — which is
    // what makes the link "explainable" rather than merely a jump.
    const anchor = new URL(page.url()).hash.slice(1);
    await expect(page.locator(`#${anchor}`)).toBeVisible();
    await expect(page.locator(`#${anchor} .relations-origin`)).toBeVisible();
  });

  test("`2P-RELATION-004`: a phone gets a bounded readable representation, and keeps the drawing", async ({ page, isMobile }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/relations");

    const compact = page.locator(".relations-compact");
    if (isMobile) {
      /*
        The assertion this whole lane exists for. The rule is a media query, and
        a media query written above the rule it overrides adds no specificity —
        it would be silently dead and every unit test would still pass.
      */
      await expect(compact).toBeVisible();
      await expect(compact.getByRole("listitem").first()).toBeVisible();
      // The picture is NOT taken away: `2P-RELATION-004` asks for an alternative
      // when the graph cannot fit, not for phones to lose the drawing.
      await expect(page.locator("[data-relations-canvas]")).toBeVisible();
    } else {
      // And it does not intrude where the figure fits.
      await expect(compact).toBeHidden();
    }
  });
});
