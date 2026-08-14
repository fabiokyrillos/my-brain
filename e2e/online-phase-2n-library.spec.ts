import { expect, test, type Page } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2N.5's authenticated acceptance — the file library's links, filters,
 * discovery and classification, proved rendering against the hosted database.
 *
 * The unit tests prove the rules; this proves what a reader actually receives.
 * Handoff §63's lesson applies throughout: **absence is never asserted alone.**
 * Every `not.toContainText` is paired with a marker proving the page rendered,
 * and every masking claim has a control — a masked row and a page that never
 * rendered look identical to a text assertion.
 *
 * ## What the link fixtures do and do not prove
 *
 * `entity_attachments` has **no writer in product code**, and this slice creates
 * none: `authenticated` holds `SELECT` only. The link rows below are planted by
 * the harness with the **service-role key**, owner-scoped, and removed with the
 * account at the end.
 *
 * **That proves the reader. It does not prove the product can create a link,
 * and nothing here should be read as evidence that it can.** The empty-state
 * journey is the other half of the same statement: an owner with no legacy or
 * restored links sees an honest emptiness and no control offering to fix it.
 *
 * A disposable account created and deleted by the harness. A second disposable
 * account for the cross-tenant control. No credential in source; all content
 * synthetic.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

/** One marker per fixture, unique enough that a stray match is impossible. */
const MARK = "2n5f41c8";
const PERSON_NAME = `Bruna Teste ${MARK}`;
const PROJECT_NAME = `Projeto Atlas ${MARK}`;
const LINKED_FILE = `contrato-vinculado-${MARK}.pdf`;
const PLAIN_FILE = `nota-simples-${MARK}.txt`;
const SECRET_FILE = `laudo-sigiloso-${MARK}.pdf`;
const IMAGE_FILE = `foto-${MARK}.png`;
const FAILED_FILE = `planilha-quebrada-${MARK}.csv`;
const PLAIN_TEXT = `Texto extraido visivel ${MARK}`;
const SECRET_TEXT = `Texto extraido sigiloso ${MARK}`;
const PLAIN_PERSON = `PessoaNoDocumentoVisivel${MARK}`;
const SECRET_PERSON = `PessoaNoDocumentoSigilosa${MARK}`;
const SECRET_TASK = `TarefaCandidataSigilosa${MARK}`;
const FOREIGN_FILE = `arquivo-de-outro-dono-${MARK}.pdf`;
const FOREIGN_PERSON = `Estranho Teste ${MARK}`;

const COPY = {
  "pt-BR": {
    heading: "Arquivos",
    linkedHeading: "Vinculado a",
    linkedFiles: "Arquivos vinculados",
    linkedEmpty: "Nenhum vínculo registrado para este arquivo.",
    noWriter: "Ainda não há como criar um vínculo novo por aqui.",
    filesEmpty: "Nenhum arquivo vinculado.",
    search: "Buscar dentro dos arquivos",
    filteredEmpty: "Nenhum arquivo com esses filtros",
    unavailable: "Link do original indisponível agora",
  },
  en: {
    heading: "Files",
    linkedHeading: "Linked to",
    linkedFiles: "Linked files",
    linkedEmpty: "No link recorded for this file.",
    noWriter: "There is no way to create a new one here yet.",
    filesEmpty: "No linked files.",
    search: "Search inside files",
    filteredEmpty: "No files match these filters",
    unavailable: "Original link unavailable right now",
  },
} as const;

test.describe("2N.5 — the file library reads links it cannot create", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-2n5-${crypto.randomUUID()}@example.com`;
  const foreignEmail = `codex-2n5-foreign-${crypto.randomUUID()}@example.com`;
  let userId: string | undefined;
  let foreignUserId: string | undefined;
  let personId: string | undefined;
  let projectId: string | undefined;
  let linkedFileId: string | undefined;
  let secretFileId: string | undefined;

  const rest = async (path: string, init: RequestInit = {}) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
        ...(init.headers ?? {}),
      },
    });

  async function insert<T>(table: string, rows: unknown): Promise<T[]> {
    // Every row of a bulk insert carries the SAME keys — PostgREST answers
    // `PGRST102 "All object keys must match"` otherwise.
    const response = await rest(table, { method: "POST", body: JSON.stringify(rows) });
    expect(response.ok, `${table} insert failed: ${await response.clone().text()}`).toBe(true);
    return (await response.json()) as T[];
  }

  async function createUser(address: string): Promise<string> {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: address, password: `Lib!${crypto.randomUUID()}A7`, email_confirm: true }),
    });
    expect(created.ok, `could not create ${address}: ${await created.clone().text()}`).toBe(true);
    return ((await created.json()) as { id: string }).id;
  }

  const attachment = (owner: string, name: string, overrides: Record<string, unknown> = {}) => ({
    user_id: owner,
    storage_path: `${owner}/${name}`,
    original_name: name,
    mime_type: "application/pdf",
    size_bytes: 2048,
    status: "ready",
    description: null,
    extracted_text: null,
    processing_error: null,
    sensitivity: "normal",
    ...overrides,
  });

  test.beforeAll(async () => {
    userId = await createUser(email);
    foreignUserId = await createUser(foreignEmail);

    const [person] = await insert<{ id: string }>("people", { user_id: userId, name: PERSON_NAME, notes: null });
    personId = person.id;
    const [project] = await insert<{ id: string }>("projects", {
      user_id: userId,
      name: PROJECT_NAME,
      description: null,
      status: "active",
    });
    projectId = project.id;

    const files = await insert<{ id: string; original_name: string }>("attachments", [
      attachment(userId, LINKED_FILE),
      attachment(userId, PLAIN_FILE, { mime_type: "text/plain" }),
      attachment(userId, SECRET_FILE, { sensitivity: "highly_sensitive" }),
      attachment(userId, IMAGE_FILE, { mime_type: "image/png" }),
      attachment(userId, FAILED_FILE, {
        mime_type: "text/csv",
        status: "failed",
        processing_error: "Não consegui ler este arquivo.",
      }),
    ]);
    const byName = new Map(files.map((file) => [file.original_name, file.id]));
    linkedFileId = byName.get(LINKED_FILE);
    secretFileId = byName.get(SECRET_FILE);

    /*
     * The interpretations. The `normal` one is the **control** for the masking
     * assertions below: if the derived block were simply missing rather than
     * withheld, this file's people and text would be absent too, and every
     * "not visible" assertion about the sensitive file would pass vacuously.
     */
    await insert("attachment_interpretations", [
      {
        user_id: userId,
        attachment_id: byName.get(PLAIN_FILE),
        version: 1,
        description: `Resumo visivel ${MARK}`,
        extracted_text: PLAIN_TEXT,
        task_candidates: [{ title: `TarefaCandidataVisivel${MARK}` }],
        extracted_people: [PLAIN_PERSON],
        extracted_projects: [],
        extracted_dates: [],
        model: "fixture",
        raw_output: {},
      },
      {
        user_id: userId,
        attachment_id: secretFileId,
        version: 1,
        description: `Resumo sigiloso ${MARK}`,
        extracted_text: SECRET_TEXT,
        task_candidates: [{ title: SECRET_TASK }],
        extracted_people: [SECRET_PERSON],
        extracted_projects: [],
        extracted_dates: [],
        model: "fixture",
        raw_output: {},
      },
    ]);

    // A recoverable failure, so `2N-FILES-007`'s retry has a real action behind
    // it rather than a button for a recovery that cannot happen.
    await insert("jobs", {
      user_id: userId,
      type: "process_attachment",
      status: "failed",
      payload: { attachment_id: byName.get(FAILED_FILE) },
      attempts: 1,
      max_attempts: 5,
      next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
      idempotency_key: `2n5-${MARK}-${crypto.randomUUID()}`,
    });

    /*
     * The link rows — planted with the service role, because `authenticated`
     * holds no INSERT and this slice deliberately did not give it one. This is
     * the harness standing in for a writer the product does not have.
     */
    await insert("entity_attachments", [
      { user_id: userId, attachment_id: linkedFileId, entity_type: "person", entity_id: personId },
      { user_id: userId, attachment_id: linkedFileId, entity_type: "project", entity_id: projectId },
    ]);

    // The cross-tenant control: a whole parallel world that must never appear.
    const [foreignPerson] = await insert<{ id: string }>("people", {
      user_id: foreignUserId,
      name: FOREIGN_PERSON,
      notes: null,
    });
    const [foreignFile] = await insert<{ id: string }>("attachments", [
      attachment(foreignUserId, FOREIGN_FILE),
    ]);
    await insert("entity_attachments", {
      user_id: foreignUserId,
      attachment_id: foreignFile.id,
      entity_type: "person",
      entity_id: foreignPerson.id,
    });
  });

  test.afterAll(async () => {
    for (const owner of [userId, foreignUserId]) {
      if (!owner) continue;
      const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${owner}`, {
        method: "DELETE",
        headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
      });
      expect(deletion.ok, `could not remove ${owner}: ${await deletion.clone().text()}`).toBe(true);
    }
  });

  const signIn = (page: Page, locale: "pt-BR" | "en" = "pt-BR") => signInOnline(page, { email, locale });

  for (const locale of ["pt-BR", "en"] as const) {
    const copy = COPY[locale];

    test(`lists files, their state and their links (${locale})`, async ({ page }) => {
      await signIn(page, locale);
      await page.goto(`/${locale}/app/files`);

      // The fixture marker: the page rendered, so what follows means something.
      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();
      await expect(page.locator("body")).toContainText(LINKED_FILE);

      // `2N-FILES-003`/`-009` — the link section exists and names the subjects,
      // read from `entity_attachments` and never from the analysis.
      const card = page.locator(`#file-${linkedFileId}`);
      await expect(card).toBeVisible();
      const links = card.locator('[data-link-direction="file-to-subject"]');
      await expect(links).toContainText(copy.linkedHeading);
      await expect(links).toContainText(PERSON_NAME);
      await expect(links).toContainText(PROJECT_NAME);
      await expect(links.locator('[data-link-state="rows"]')).toBeVisible();

      // `2N-FILES-007` — a processing failure is visible where it happened.
      await expect(page.locator("body")).toContainText(FAILED_FILE);
    });

    test(`says when a file has no link, and offers no control (${locale})`, async ({ page }) => {
      // `2N-FILES-009`'s honest empty state, and the remainder said to the user.
      await signIn(page, locale);
      await page.goto(`/${locale}/app/files`);
      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();

      const empty = page
        .locator('[data-link-direction="file-to-subject"]')
        .filter({ hasText: copy.linkedEmpty })
        .first();
      await expect(empty).toBeVisible();
      await expect(empty).toContainText(copy.noWriter);

      // The load-bearing negative: nothing here promises a link can be made.
      expect(await empty.locator("button").count()).toBe(0);
      expect(await empty.locator("form").count()).toBe(0);
      expect(await empty.locator("input, select").count()).toBe(0);

      // And it is NOT rendered as a failure — the two states are different
      // claims and only one of them is true here.
      expect(await empty.locator('[data-link-state="failed"]').count()).toBe(0);
      await expect(empty.locator('[data-link-state="empty"]')).toBeVisible();
    });

    test(`navigates file → entity and entity → file (${locale})`, async ({ page }) => {
      // `2N-FILES-009`, both directions, and `2N-PERSON-008`.
      await signIn(page, locale);
      await page.goto(`/${locale}/app/files`);
      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();

      await page
        .locator(`#file-${linkedFileId} [data-link-direction="file-to-subject"]`)
        .getByRole("link", { name: PERSON_NAME })
        .click();

      await expect(page).toHaveURL(new RegExp(`/app/people/${personId}`));
      await expect(page.getByRole("heading", { level: 1, name: PERSON_NAME })).toBeVisible();

      // The reverse direction, on the page we just landed on.
      const filesSection = page.locator('[data-link-direction="subject-to-file"]');
      await expect(filesSection).toContainText(copy.linkedFiles);
      await expect(filesSection).toContainText(LINKED_FILE);

      await filesSection.getByRole("link", { name: LINKED_FILE }).click();
      await expect(page).toHaveURL(/\/app\/files/);
      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();
    });

    test(`the project page reuses the same contract (${locale})`, async ({ page }) => {
      await signIn(page, locale);
      await page.goto(`/${locale}/app/projects/${projectId}`);
      await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible();

      const filesSection = page.locator('[data-link-direction="subject-to-file"]');
      await expect(filesSection).toContainText(copy.linkedFiles);
      await expect(filesSection).toContainText(LINKED_FILE);
      await expect(filesSection.locator('[data-link-state="rows"]')).toBeVisible();
    });

    test(`filters over the whole set, not the page (${locale})`, async ({ page }) => {
      // `2N-FILES-010`. Every predicate reaches the query, so a filter that
      // excludes a file excludes it everywhere rather than on this page only.
      await signIn(page, locale);

      await page.goto(`/${locale}/app/files?state=failed`);
      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();
      await expect(page.locator("body")).toContainText(FAILED_FILE);
      await expect(page.locator("body")).not.toContainText(LINKED_FILE);

      // The control: the same page unfiltered shows both, so the exclusion above
      // is the filter working rather than the file being absent.
      await page.goto(`/${locale}/app/files`);
      await expect(page.locator("body")).toContainText(FAILED_FILE);
      await expect(page.locator("body")).toContainText(LINKED_FILE);

      await page.goto(`/${locale}/app/files?kind=image`);
      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();
      await expect(page.locator("body")).toContainText(IMAGE_FILE);
      await expect(page.locator("body")).not.toContainText(LINKED_FILE);

      // An empty filtered set says it is a filtered set, not an empty library.
      await page.goto(`/${locale}/app/files?state=uploaded`);
      await expect(page.locator("body")).toContainText(copy.filteredEmpty);

      // The active chip announces itself the same way to both audiences.
      await page.goto(`/${locale}/app/files?state=failed`);
      const active = page.locator('.filter-chip[aria-current="true"]');
      expect(await active.count()).toBeGreaterThan(0);
    });

    test(`links to search rather than reimplementing it (${locale})`, async ({ page }) => {
      // `2N-FILES-011`.
      await signIn(page, locale);
      await page.goto(`/${locale}/app/files`);
      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();

      const search = page.getByRole("link", { name: copy.search });
      await expect(search).toBeVisible();
      await search.click();
      await expect(page).toHaveURL(/\/app\/search/);
    });
  }

  test("2N-FILES-006: extracted content stays inside the classification", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/files");
    await expect(page.getByRole("heading", { level: 1, name: COPY["pt-BR"].heading })).toBeVisible();

    const body = page.locator("body");

    /*
     * The control comes FIRST, so the assertions after it cannot pass vacuously.
     * The `normal` file's extracted text, the person the model found inside the
     * document and its candidate task title are all present in the DOM — which
     * proves the derived block renders at all.
     */
    await expect(body).toContainText(PLAIN_FILE);
    await expect(body).toContainText(PLAIN_TEXT);
    await expect(body).toContainText(PLAIN_PERSON);

    // Now the sensitive file. Its row exists — masking is in place, not
    // exclusion, so the count stays honest — and none of its content does.
    const secret = page.locator(`#file-${secretFileId}`);
    await expect(secret).toBeVisible();
    await expect(secret.locator('[data-masked="true"]').first()).toBeVisible();

    await expect(body).not.toContainText(SECRET_FILE);
    await expect(body).not.toContainText(SECRET_TEXT);
    // The defect this slice found: these two rendered in the clear beside a
    // masked name and a masked extracted text.
    await expect(body).not.toContainText(SECRET_PERSON);
    await expect(body).not.toContainText(SECRET_TASK);

    // Nor through an attribute, a title or an accessible name.
    expect(await page.locator(`[title*="${MARK}"]`).count()).toBe(0);
    expect(await page.locator(`[aria-label*="${SECRET_PERSON}"]`).count()).toBe(0);
  });

  test("a signing failure is said, not rendered as absence", async ({ page }) => {
    /*
     * The fixture rows carry a `storage_path` with no object behind it, so
     * storage returns a per-item error inside a successful response — the one
     * read on this page whose failure cannot reach the error boundary.
     *
     * Before this slice the failed item was filtered out and the "open original"
     * link simply vanished, which reads as "there is no original".
     */
    await signIn(page);
    await page.goto("/pt-BR/app/files");
    await expect(page.getByRole("heading", { level: 1, name: COPY["pt-BR"].heading })).toBeVisible();
    await expect(page.locator("body")).toContainText(COPY["pt-BR"].unavailable);
  });

  test("no foreign file, person or link is reachable", async ({ page }) => {
    // The cross-tenant control. The fixture marker proves the page rendered, so
    // the three absences below are evidence rather than a blank screen.
    await signIn(page);
    await page.goto("/pt-BR/app/files");
    await expect(page.locator("body")).toContainText(LINKED_FILE);
    await expect(page.locator("body")).not.toContainText(FOREIGN_FILE);
    await expect(page.locator("body")).not.toContainText(FOREIGN_PERSON);

    await page.goto(`/pt-BR/app/people/${personId}`);
    await expect(page.getByRole("heading", { level: 1, name: PERSON_NAME })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(FOREIGN_FILE);
  });

  test("is operable by keyboard and fits a narrow viewport", async ({ page }, testInfo) => {
    // `2N-ACCESS-001`, `2N-MOBILE-001`.
    await signIn(page);
    await page.goto("/pt-BR/app/files");
    await expect(page.getByRole("heading", { level: 1, name: COPY["pt-BR"].heading })).toBeVisible();

    const chip = page.locator(".filter-chip").first();
    await chip.focus();
    await expect(chip).toBeFocused();
    const outline = await chip.evaluate((node) => getComputedStyle(node).outlineStyle);
    expect(outline, "focus must be visible, not merely present").not.toBe("none");

    // Every filter chip is a real touch target.
    const box = await chip.boundingBox();
    expect(box?.height ?? 0, `filter chip is too small on ${testInfo.project.name}`).toBeGreaterThanOrEqual(44);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the page scrolls horizontally on ${testInfo.project.name}`).toBeLessThanOrEqual(1);

    // The lists are small here, so no bound is hit and no notice may appear —
    // the control for `bounded-notice.tsx` rendering nothing when complete.
    expect(await page.locator('[data-bounded="true"]').count()).toBe(0);
  });
});
