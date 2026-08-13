import { expect, test, type Page } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2N.2's authenticated acceptance — the project page's state, roles,
 * recent changes, decisions, provenance and bounds, proved rendering.
 *
 * The unit tests prove each derivation; this proves what a reader receives.
 * Handoff §63 recorded a loading state that was correct in every unit test and
 * silent in a real browser, so the same two rules apply here:
 *
 * - **Absence is never asserted alone.** Every `not.toContainText` is paired
 *   with a marker proving the page rendered — usually the project's own name.
 * - **Every claim has a control.** A section that renders nothing and a section
 *   that renders the wrong thing look identical to a one-sided assertion, so
 *   each fixture carries a row that must appear beside one that must not.
 *
 * ## Three projects, because one would contaminate itself
 *
 * `STATE` is read-only: its counts, roles, decisions and memories are asserted
 * and nothing in the journey changes it. `CHANGE` exists to be edited through
 * the product's own form, because the only honest proof that the change list
 * works is a change the product itself recorded — a fixture row inserted behind
 * the surface would prove the reader and not the writer. `BOUND` carries 101
 * linked entries, which is the only way to see a bound reported and to prove the
 * probe row is counted rather than rendered.
 *
 * A disposable account created and deleted by the harness. No credential in
 * source; all content synthetic.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const STATE_PROJECT = "Projeto Estado 2N2 d41a9c";
/**
 * One change project **per locale**, and the reason is a real defect this
 * fixture had first.
 *
 * Both locale runs share a worker, so a single project meant the second run
 * found the status already `paused`. Its edit was then a no-op, the audit row
 * recorded `paused -> paused`, and `extractChanges` correctly produced no
 * from-to clause — so the assertion failed against a page that was behaving
 * exactly as specified. A shared mutable fixture makes a test depend on the
 * order its cases happen to run in.
 */
const CHANGE_PROJECT = { "pt-BR": "Projeto Mudanca PT 2N2 b73f10", en: "Projeto Mudanca EN 2N2 a92d44" } as const;
const BOUND_PROJECT = "Projeto Limite 2N2 e58c22";
const ROLED_PERSON = "Marina Teste 2N2";
const UNROLED_PERSON = "Otavio Teste 2N2";
const STORED_ROLE = "revisora de contrato";
const DECISION_ENTRY = "Fechamos o escopo em duas fases 9a3e71";
const BLOCKER_ENTRY = "Fornecedor ainda nao respondeu 4c8b52";
const SUPERSEDED_ENTRY = "Rascunho de decisao descartado 2f7d16";
const SOURCED_MEMORY = "Revisao quinzenal combinada 5e1c93";
const ORPHANED_MEMORY = "Combinado antigo sem registro 8b4a06";

const COPY = {
  "pt-BR": {
    state: "Estado",
    active: "Ativo",
    paused: "Pausado",
    openOne: "1 em aberto",
    noRole: "Sem papel definido",
    decisions: "Decisões lidas nos seus registros",
    noDecisions: "Nenhum registro deste projeto foi lido como uma decisão",
    changes: "O que mudou recentemente",
    noChanges: "Nenhuma alteração registrada neste projeto ainda",
    changed: "Você alterou a situação de Ativo para Pausado",
    memories: "Memórias deste projeto",
    sourced: "De um registro seu",
    unsourced: "Origem não registrada",
    ownerAuthored: "Informado por você",
    persisted: "Você mantém esta seção",
    derived: "Derivado dos seus registros",
    back: "Voltar para onde você estava",
  },
  en: {
    state: "State",
    active: "Active",
    paused: "Paused",
    openOne: "1 open",
    noRole: "No role set",
    decisions: "Decisions read in your entries",
    noDecisions: "No entry on this project was read as a decision",
    changes: "What changed recently",
    noChanges: "No change has been recorded on this project yet",
    // `history/copy.ts` calls this field "the state" in a sentence and "Status"
    // as a label. The journey asserts the sentence the product actually writes.
    changed: "You changed the state from Active to Paused",
    memories: "Memories about this project",
    sourced: "From an entry of yours",
    unsourced: "No source recorded",
    ownerAuthored: "Informed by you",
    persisted: "You maintain this section",
    derived: "Derived from your records",
    back: "Back to where you were",
  },
} as const;

test.describe("2N.2 — the project page states its situation without inventing one", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-2n2-${crypto.randomUUID()}@example.com`;
  let userId: string | undefined;
  let stateProjectId: string | undefined;
  const changeProjectIds = new Map<"pt-BR" | "en", string>();
  let boundProjectId: string | undefined;
  let sourceEntryId: string | undefined;

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
    // Every row of a bulk insert carries the SAME keys, nulls spelled out —
    // PostgREST answers `PGRST102 "All object keys must match"` otherwise, which
    // is what made 2N.0's journey un-runnable until it was actually executed.
    const response = await rest(table, { method: "POST", body: JSON.stringify(rows) });
    expect(response.ok, `${table} insert failed: ${await response.clone().text()}`).toBe(true);
    return (await response.json()) as T[];
  }

  async function patch(path: string, body: unknown) {
    const response = await rest(path, { method: "PATCH", body: JSON.stringify(body) });
    expect(response.ok, `${path} patch failed: ${await response.clone().text()}`).toBe(true);
  }

  /**
   * One interpretation, and whether the entry points at it as its current one.
   *
   * Returns the id because `entry_entities.interpretation_id` is **not null**:
   * a link records which reading produced it, so a project link cannot be
   * fabricated without one.
   */
  async function interpret(entryId: string, concepts: string[], current: boolean): Promise<string> {
    const [interpretation] = await insert<{ id: string }>("entry_interpretations", {
      user_id: userId,
      entry_id: entryId,
      summary: "Leitura sintetica de teste",
      concepts,
      confidence: 0.9,
      model: "test-model",
      strategy_version: "test",
      prompt_version: "test",
      raw_output: {},
    });
    if (current) await patch(`entries?id=eq.${entryId}`, { current_interpretation_id: interpretation.id });
    return interpretation.id;
  }

  /** `mention` is `not null` too, so every link states the text it came from. */
  const projectLink = (entryId: string, interpretationId: string, projectId: string) => ({
    user_id: userId,
    entry_id: entryId,
    interpretation_id: interpretationId,
    entity_type: "project",
    entity_id: projectId,
    mention: "projeto",
    confidence: 1,
  });

  test.beforeAll(async () => {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password: `Project!${crypto.randomUUID()}A7`, email_confirm: true }),
    });
    expect(created.ok).toBe(true);
    userId = ((await created.json()) as { id: string }).id;

    const projects = await insert<{ id: string; name: string }>("projects", [
      { user_id: userId, name: STATE_PROJECT, description: null, status: "active", organization_id: null },
      { user_id: userId, name: CHANGE_PROJECT["pt-BR"], description: null, status: "active", organization_id: null },
      { user_id: userId, name: CHANGE_PROJECT.en, description: null, status: "active", organization_id: null },
      { user_id: userId, name: BOUND_PROJECT, description: null, status: "active", organization_id: null },
    ]);
    const byName = (name: string) => projects.find((row) => row.name === name)!.id;
    stateProjectId = byName(STATE_PROJECT);
    changeProjectIds.set("pt-BR", byName(CHANGE_PROJECT["pt-BR"]));
    changeProjectIds.set("en", byName(CHANGE_PROJECT.en));
    boundProjectId = byName(BOUND_PROJECT);

    /*
     * `2N-PROJECT-002`. Two people, one with a stored role and one without —
     * the pair is what makes the role a reading of `person_projects.role` rather
     * than something the surface could have produced from the person's name or
     * from what they do elsewhere.
     */
    const people = await insert<{ id: string; name: string }>("people", [
      { user_id: userId, name: ROLED_PERSON, notes: null, organization_id: null },
      { user_id: userId, name: UNROLED_PERSON, notes: null, organization_id: null },
    ]);
    await insert("person_projects", [
      { user_id: userId, person_id: people[0].id, project_id: stateProjectId, role: STORED_ROLE, valid_until: null, confidence: 1 },
      { user_id: userId, person_id: people[1].id, project_id: stateProjectId, role: null, valid_until: null, confidence: 1 },
    ]);

    /*
     * `2N-PROJECT-003`. Two tasks: one open, one completed. The count must be 1,
     * which no implementation that simply counted linked tasks would produce.
     */
    const tasks = await insert<{ id: string }>("tasks", [
      { user_id: userId, title: "Tarefa aberta 2N2", status: "todo", source_entry_id: null },
      { user_id: userId, title: "Tarefa concluida 2N2", status: "completed", source_entry_id: null },
    ]);
    await insert("task_projects", tasks.map((task) => ({ user_id: userId, task_id: task.id, project_id: stateProjectId })));

    /*
     * `2N-PROJECT-005`. Three entries linked to the same project:
     *
     * - one read as a **decision**, current — must appear;
     * - one read as a **blocker**, current — must NOT, because a blocker is not
     *   a risk and not a decision, and mapping it to either would be the
     *   fabrication the requirement forbids;
     * - one read as a decision whose interpretation is **not current** — must
     *   NOT, because a reading the owner replaced is not a decision the product
     *   may still show.
     */
    const entries = await insert<{ id: string; original_content: string }>("entries", [
      { user_id: userId, original_content: DECISION_ENTRY, sensitivity: "normal" },
      { user_id: userId, original_content: BLOCKER_ENTRY, sensitivity: "normal" },
      { user_id: userId, original_content: SUPERSEDED_ENTRY, sensitivity: "normal" },
    ]);
    const byContent = (content: string) => entries.find((row) => row.original_content === content)!.id;
    sourceEntryId = byContent(DECISION_ENTRY);

    // Keyed by entry rather than positional: the reading a link records must be
    // the reading of THAT entry, and relying on insert order to pair them would
    // be a fixture that is right by luck.
    const readings = new Map<string, string>([
      [byContent(DECISION_ENTRY), await interpret(byContent(DECISION_ENTRY), ["raw_record", "decision"], true)],
      [byContent(BLOCKER_ENTRY), await interpret(byContent(BLOCKER_ENTRY), ["raw_record", "blocker"], true)],
      [byContent(SUPERSEDED_ENTRY), await interpret(byContent(SUPERSEDED_ENTRY), ["decision"], false)],
    ]);

    await insert(
      "entry_entities",
      entries.map((entry) => projectLink(entry.id, readings.get(entry.id)!, stateProjectId!)),
    );

    /*
     * `2N-PROV-001` on a project. One memory with a resolvable source and one
     * with none: the second must read `unsourced` and must NOT borrow the
     * owner-authored wording, which is reserved for the relation tables.
     */
    await insert("memories", [
      { user_id: userId, content: SOURCED_MEMORY, sensitivity: "normal", project_id: stateProjectId, person_id: null, source_entry_id: sourceEntryId },
      { user_id: userId, content: ORPHANED_MEMORY, sensitivity: "normal", project_id: stateProjectId, person_id: null, source_entry_id: null },
    ]);

    /*
     * The bound fixture: 101 linked entries, one more than `CONTEXTUAL_LIMIT`.
     * 100 must render, the notice must appear, and the 101st — the probe — must
     * be counted rather than shown.
     */
    const bulk = Array.from({ length: 101 }, (_, index) => ({
      user_id: userId,
      original_content: `Registro limite ${String(index).padStart(3, "0")} 2N2`,
      sensitivity: "normal",
    }));
    const bulkEntries = await insert<{ id: string }>("entries", bulk);
    // One reading per entry, because `entry_entities.interpretation_id` is not
    // null. Two bulk calls rather than 202 single ones.
    const bulkReadings = await insert<{ id: string; entry_id: string }>(
      "entry_interpretations",
      bulkEntries.map((entry) => ({
        user_id: userId,
        entry_id: entry.id,
        summary: "Leitura sintetica de teste",
        concepts: ["raw_record"],
        confidence: 0.9,
        model: "test-model",
        strategy_version: "test",
        prompt_version: "test",
        raw_output: {},
      })),
    );
    const bulkByEntry = new Map(bulkReadings.map((row) => [row.entry_id, row.id]));
    await insert(
      "entry_entities",
      bulkEntries.map((entry) => projectLink(entry.id, bulkByEntry.get(entry.id)!, boundProjectId!)),
    );
  });

  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  const signIn = (page: Page, locale: "pt-BR" | "en" = "pt-BR") => signInOnline(page, { email, locale });

  for (const locale of ["pt-BR", "en"] as const) {
    const copy = COPY[locale];

    test(`states the project's situation from records that exist (${locale})`, async ({ page }) => {
      // `2N-PROJECT-001`, `-002`, `-003`.
      await signIn(page, locale);
      await page.goto(`/${locale}/app/projects/${stateProjectId}`);

      // The fixture marker: the page rendered, so what follows means something.
      await expect(page.getByRole("heading", { level: 1, name: STATE_PROJECT })).toBeVisible();

      const state = page.locator('[data-project-state="true"]');
      await expect(state).toBeVisible();
      await expect(state).toContainText(copy.state);
      await expect(state).toContainText(copy.active);
      // One of the two linked tasks is completed, so a count of linked tasks
      // would read 2 here. It reads 1.
      await expect(state).toContainText(copy.openOne);
      // Nothing is truncated, so the count is exact rather than a floor.
      await expect(page.locator('[data-open-commitments="exact"]')).toBeVisible();

      // `2N-PROJECT-002` — the role is the stored one, and the person without a
      // stored role gets the "no role" sentence rather than a guess. The pair is
      // the control: an implementation that invented roles would fill both.
      await expect(page.locator("body")).toContainText(STORED_ROLE);
      await expect(page.locator("body")).toContainText(copy.noRole);
    });

    test(`shows only the records a reading marked as decisions (${locale})`, async ({ page }) => {
      // `2N-PROJECT-005`.
      await signIn(page, locale);
      await page.goto(`/${locale}/app/projects/${stateProjectId}`);
      await expect(page.getByRole("heading", { level: 1, name: STATE_PROJECT })).toBeVisible();

      const decisions = page.locator("#decisions");
      await expect(decisions).toContainText(copy.decisions);
      await expect(decisions).toContainText(DECISION_ENTRY);

      /*
       * The two controls. Both entries are linked to this project and both are
       * on the page — the timeline shows them — so their absence from this
       * section is a statement about the section rather than about the fixture.
       */
      await expect(decisions).not.toContainText(BLOCKER_ENTRY);
      await expect(decisions).not.toContainText(SUPERSEDED_ENTRY);
      await expect(page.locator("#timeline")).toContainText(BLOCKER_ENTRY);
      await expect(page.locator("#timeline")).toContainText(SUPERSEDED_ENTRY);

      // It is derived, and says so rather than reading as a field the owner
      // filled in.
      await expect(decisions.locator('[data-section-origin="derived"]')).toBeVisible();
    });

    test(`says where each memory came from, and invents nothing (${locale})`, async ({ page }) => {
      // `2N-PROV-001`, `-004`.
      await signIn(page, locale);
      await page.goto(`/${locale}/app/projects/${stateProjectId}`);
      await expect(page.getByRole("heading", { level: 1, name: STATE_PROJECT })).toBeVisible();

      const memories = page.locator("#memories");
      await expect(memories).toContainText(copy.memories);
      await expect(memories).toContainText(SOURCED_MEMORY);
      await expect(memories).toContainText(ORPHANED_MEMORY);

      await expect(memories.locator('[data-provenance="sourced"]')).toBeVisible();
      await expect(memories.locator('[data-provenance="unsourced"]')).toBeVisible();

      // The control that makes the pair evidence rather than coincidence: an
      // unsourced memory must not borrow the wording reserved for the relation
      // tables, where owner-authorship is true by construction.
      const unsourced = await memories.locator('[data-provenance="unsourced"]').first().innerText();
      expect(unsourced).not.toContain(copy.ownerAuthored);
      expect(unsourced).toContain(copy.unsourced);

      // The People panel IS owner-authored, on the same page, which proves the
      // wording exists and was withheld deliberately above.
      await expect(page.locator('[data-provenance="owner-authored"]').first()).toBeVisible();
    });

    test(`records a change the product itself made, and nothing before it (${locale})`, async ({ page }) => {
      /*
       * `2N-PROJECT-004`. The empty state is asserted on the untouched project
       * and the populated one on a project this test edits **through the form**.
       * A fixture row written behind the surface would have proved the reader
       * and left the writer untested.
       */
      await signIn(page, locale);

      await page.goto(`/${locale}/app/projects/${stateProjectId}`);
      await expect(page.getByRole("heading", { level: 1, name: STATE_PROJECT })).toBeVisible();
      await expect(page.locator("#changes")).toContainText(copy.changes);
      await expect(page.locator("#changes")).toContainText(copy.noChanges);

      const changeProject = CHANGE_PROJECT[locale];
      const changeUrl = `/${locale}/app/projects/${changeProjectIds.get(locale)}`;
      await page.goto(changeUrl);
      await expect(page.getByRole("heading", { level: 1, name: changeProject })).toBeVisible();

      await page.getByRole("button", { name: /Editar|Edit/ }).first().click();
      await page.getByLabel(/Situação|Status/).first().selectOption("paused");
      await page.getByRole("button", { name: /Salvar|Save/ }).first().click();
      /*
       * Wait for the write to be confirmed by the product before asking what it
       * recorded. Asserting straight after the click tests the revalidation
       * race, not the change list.
       *
       * The allowance is generous because this is the one journey that WRITES:
       * a pre-read, an update, an audit insert and two revalidations, against
       * the hosted database, from a local server, with four workers competing.
       * A run caught it still showing "Saving…" at 15s with every control
       * disabled and no error — slow, not broken, and shortening the wait would
       * only convert a slow path into a red test.
       */
      await expect(page.locator(".entity-edit-feedback.success")).toBeVisible({ timeout: 45_000 });

      // Re-entered rather than refreshed in place: this is what a reader gets,
      // and it does not depend on how the router happened to revalidate.
      await page.goto(changeUrl);
      const changes = page.locator("#changes");
      await expect(changes).toContainText(copy.changed, { timeout: 15_000 });
      // The audit `reason` is never selected, so no writer's internal sentence
      // can reach the page.
      await expect(changes).not.toContainText("Owner edited the project");
    });

    test(`is operable by keyboard and leaks nothing through attributes (${locale})`, async ({ page }) => {
      // `2N-ACCESS-001`, `-002`, `-003`, `2N-PRIVACY-002`.
      await signIn(page, locale);
      await page.goto(`/${locale}/app/projects/${stateProjectId}`);
      await expect(page.getByRole("heading", { level: 1, name: STATE_PROJECT })).toBeVisible();

      const link = page.locator('[data-provenance="sourced"] a').first();
      await link.focus();
      await expect(link).toBeFocused();
      const outline = await link.evaluate((node) => getComputedStyle(node).outlineStyle);
      expect(outline, "focus must be visible, not merely present").not.toBe("none");

      // No provenance line carries a `title`: unreachable by keyboard, invisible
      // to touch, and a second copy of text in an attribute.
      expect(await page.locator(".provenance-note [title]").count()).toBe(0);

      // No accessible name anywhere on the page repeats a row's content. The
      // source link is named positionally, which is what keeps a masked title
      // out of the accessibility tree.
      const labels = await page.locator("[aria-label]").evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label") ?? ""),
      );
      for (const forbidden of [SOURCED_MEMORY, ORPHANED_MEMORY, DECISION_ENTRY]) {
        expect(labels.join(" | "), `an aria-label carries row content`).not.toContain(forbidden);
      }

      // `2N-ACCESS-002` — structure is semantic: every section carries a heading
      // and the page has exactly one h1.
      expect(await page.getByRole("heading", { level: 1 }).count()).toBe(1);
      expect(await page.getByRole("heading", { level: 2 }).count()).toBeGreaterThanOrEqual(5);
      await expect(page.locator('[data-section-origin="persisted"]').first()).toBeVisible();
      await expect(page.locator('[data-section-origin="derived"]').first()).toBeVisible();
      await expect(page.locator("body")).toContainText(copy.persisted);
      await expect(page.locator("body")).toContainText(copy.derived);
    });

    test(`returns the reader to their place after opening a source (${locale})`, async ({ page }) => {
      // `2N-PERSON-006`, `2N-PROV-003`, applied to this surface.
      await signIn(page, locale);
      await page.goto(`/${locale}/app/projects/${stateProjectId}`);
      await expect(page.getByRole("heading", { level: 1, name: STATE_PROJECT })).toBeVisible();

      await page.locator('[data-provenance="sourced"] a').first().click();

      await expect(page).toHaveURL(new RegExp(`/app/inbox/${sourceEntryId}`));
      await expect(page.locator("body")).toContainText(DECISION_ENTRY);

      const back = page.locator('[data-return-to-source="true"]');
      await expect(back).toBeVisible();
      await expect(back).toHaveText(copy.back);
      await back.click();

      await expect(page).toHaveURL(/#memory-/);
      await expect(page.getByRole("heading", { level: 1, name: STATE_PROJECT })).toBeVisible();
    });
  }

  test("reports a bound instead of rendering the probe row", async ({ page }) => {
    // `2N-PROJECT-006`. 101 linked entries: exactly 100 render, and the page
    // says there are more rather than looking complete.
    await signIn(page);
    await page.goto(`/pt-BR/app/projects/${boundProjectId}`);
    await expect(page.getByRole("heading", { level: 1, name: BOUND_PROJECT })).toBeVisible();

    const rows = page.locator("#timeline .timeline-list > article");
    await expect(rows).toHaveCount(100);
    await expect(page.locator('#timeline [data-bounded="true"]')).toBeVisible();
  });

  test("stays within the viewport and reports no bound it did not hit", async ({ page }, testInfo) => {
    // `2N-MOBILE-001`, and the control for the bound above: on a small project
    // no notice may appear at all.
    await signIn(page);
    await page.goto(`/pt-BR/app/projects/${stateProjectId}`);
    await expect(page.getByRole("heading", { level: 1, name: STATE_PROJECT })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the page scrolls horizontally on ${testInfo.project.name}`).toBeLessThanOrEqual(1);

    expect(await page.locator('[data-bounded="true"]').count()).toBe(0);
  });
});
