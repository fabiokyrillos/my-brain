import { expect, test, type Page } from "@playwright/test";

import { onlineEnvironment, signInOnline } from "./support/online-session";

/**
 * Phase 2Q slice 2Q.2 — **a review that cited a task offers a link to that
 * task, and the link lands.**
 *
 * ## The boundary this lane owns, and no other
 *
 * The traceability contract is explicit: *"a citation is proved at the boundary
 * where a link is **clicked and lands**, not where an id is stored. A test that
 * reads the column back proves `2Q-CITE-*` and proves nothing about
 * `2Q-LINK-*`."* Unit tests own the shape; **this owns the click.**
 *
 * ## Why the review is seeded rather than generated
 *
 * Generating one calls `generateReview`, which is a **paid AI call against the
 * owner's BYOK credential**. ADR-128 Decision 5 forbids spending one without a
 * further authorization, so the envelope is written directly, in exactly the
 * shape `buildCitationsEnvelope` produces — and `citations-persistence.test.ts`
 * plus `phase_2q_summary_citations.sql` are what prove the **producer** writes
 * that shape. This lane proves the **consumer**.
 *
 * The real producer's end-to-end proof is item 1 of the owner's device
 * checkpoint, and it is recorded as **UNSPENDABLE** rather than as a pass.
 *
 * ## The fixture is disposable and owner-scoped
 *
 * One throwaway account, deleted in `afterAll`, which cascades. No personal
 * content reaches it: every string below is synthetic.
 */

const { supabaseUrl, serviceRoleKey } = onlineEnvironment;
const onlineConfigured = onlineEnvironment.configured;

/** A string that must appear NOWHERE in the sources area — `2Q-LINK-008`. */
const ENTRY_MARKER = "MARCADOR-REGISTRO-CONFIDENCIAL-9F31";
const TASK_MARKER = "MARCADOR-TAREFA-CONFIDENCIAL-4B72";

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
  const email = `codex-2qcit-${crypto.randomUUID()}@example.com`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password: `Cq!${crypto.randomUUID()}A7`, email_confirm: true }),
  });
  expect(response.ok, await response.clone().text()).toBe(true);
  const { id } = (await response.json()) as { id: string };
  return { email, id };
}

type Fixture = {
  email: string;
  userId: string;
  entryId: string;
  taskId: string;
  reviewId: string;
  goneTaskId: string;
};

test.describe("a review's cited items are reachable, and carry no content", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  test.describe.configure({ mode: "serial" });

  let fixture: Fixture;
  /**
   * The account id, recorded **the instant it exists** — before any other row.
   *
   * ## A real leak this lane produced, and the reason this variable is separate
   *
   * `afterAll` used to guard on `fixture?.userId`, which is assigned at the
   * **end** of `beforeAll`. The first run of this lane failed midway — PostgREST
   * refused the bulk task insert — so `beforeAll` threw, `fixture` was never
   * assigned, and the cleanup **returned early and deleted nothing**. A
   * throwaway account and its entry were left on the hosted project, and the
   * only reason it was noticed is that the residue control looks for markers
   * rather than assuming the teardown ran.
   *
   * A cleanup guard must key on something that exists as early as the thing it
   * cleans. This does.
   */
  let createdUserId: string | null = null;

  test.beforeAll(async () => {
    const owner = await createAccount();
    createdUserId = owner.id;
    const now = new Date();
    const iso = now.toISOString();
    const dateOnly = iso.slice(0, 10);

    const [entry] = await admin("entries", {
      method: "POST",
      body: JSON.stringify([{
        user_id: owner.id,
        original_content: `Conversa sobre o cronograma. ${ENTRY_MARKER}`,
        occurred_at: iso,
      }]),
    });

    /*
      Two tasks: one that stays, and one deleted before the render so the
      degradation arm has a real subject.

      **Both objects carry the same key set**, because PostgREST refuses a bulk
      insert whose objects do not — `PGRST102: All object keys must match`. The
      2P reviews lane records the same rule in its own comment, and this lane
      hit it anyway on the first run: giving one task a `completed_at` and the
      other none was enough.

      `tasks_status_check` admits only inbox / todo / in_progress / waiting /
      blocked / deferred / completed / cancelled — there is **no `done`**, and
      assuming one already cost this phase a correction in its pgTAP fixture.
    */
    const tasks = await admin("tasks", {
      method: "POST",
      body: JSON.stringify([
        { user_id: owner.id, title: `Fechar o contrato ${TASK_MARKER}`, status: "completed", completed_at: iso },
        { user_id: owner.id, title: "Tarefa que sera removida", status: "todo", completed_at: null },
      ]),
    });
    const [task, goneTask] = tasks as { id: string }[];

    const envelope = {
      v: "2026-08-09.1",
      evidence: "evidenced",
      reach: ["entry", "task"],
      sources: [
        { id: `entry:${entry.id}`, type: "entry", sourceId: entry.id, support: "direct_record" },
        { id: `task:${task.id}`, type: "task", sourceId: task.id, support: "product_state" },
        // The third resolves to nothing once its task is deleted below.
        { id: `task:${goneTask.id}`, type: "task", sourceId: goneTask.id, support: "product_state" },
      ],
    };

    const [review] = await admin("summaries", {
      method: "POST",
      body: JSON.stringify([{
        user_id: owner.id,
        period_type: "daily",
        period_start: dateOnly,
        period_end: dateOnly,
        title: "Resumo do dia",
        status: "generated",
        model: "fixture",
        // The prose names the task by title WITHOUT linking it — `2Q-LINK-004`'s
        // subject. A name is not a citation and must never become one.
        content: `Voce concluiu **Fechar o contrato ${TASK_MARKER}** hoje.`,
        original_content: "Voce concluiu a tarefa hoje.",
        citations: envelope,
      }]),
    });

    await admin(`tasks?id=eq.${goneTask.id}`, { method: "DELETE" });

    fixture = {
      email: owner.email,
      userId: owner.id,
      entryId: entry.id,
      taskId: task.id,
      goneTaskId: goneTask.id,
      reviewId: review.id,
    };
  });

  test.afterAll(async () => {
    if (!createdUserId) return;
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${createdUserId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    // **Asserted, not fired and forgotten.** A teardown whose failure is
    // invisible is how residue accumulates on a hosted project one run at a
    // time, and nothing downstream would ever say so.
    expect(response.ok, `deleting the fixture account failed: ${await response.clone().text()}`)
      .toBe(true);
    // The negative half of the residue control, run where it belongs: the same
    // reader that saw the account must now not see it.
    const check = await fetch(
      `${supabaseUrl}/rest/v1/entries?user_id=eq.${createdUserId}&select=id`,
      { headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` } },
    );
    expect(await check.json(), "the cascade left rows behind").toEqual([]);
    createdUserId = null;
  });

  async function openReview(page: Page, locale: "pt-BR" | "en" = "pt-BR") {
    await signInOnline(page, { email: fixture.email, locale, next: `/${locale}/app/reviews` });
    await page.goto(`/${locale}/app/reviews/${fixture.reviewId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Resumo do dia" })).toBeVisible();
  }

  test("2Q-LINK-006/-009: a cited task links to the real task, and opening it lands there", async ({ page }) => {
    await openReview(page);

    const rows = page.locator("li.review-cited-row");
    await expect(rows).toHaveCount(3);

    // The (kind, href) pair, on the row that matters most.
    const taskRow = page.locator(`li.review-cited-row:has(a[href="/pt-BR/app/work/${fixture.taskId}"])`);
    await expect(taskRow).toHaveCount(1);
    await expect(taskRow.locator(".review-cited-kind")).toHaveText("Tarefa");

    // The entry, on its own canonical route.
    await expect(page.locator(`li.review-cited-row a[href="/pt-BR/app/inbox/${fixture.entryId}"]`)).toHaveCount(1);

    // **The boundary this lane owns**: click, and land on the real object.
    await taskRow.locator("a").click();
    await expect(page).toHaveURL(new RegExp(`/pt-BR/app/work/${fixture.taskId}$`));
    await expect(page.getByText(`Fechar o contrato ${TASK_MARKER}`).first()).toBeVisible();
  });

  test("2Q-LINK-008: the sources area shows no content of any cited record", async ({ page }) => {
    await openReview(page);

    const area = page.locator("section.review-detail-sources");
    await expect(area).toBeVisible();
    const text = (await area.textContent()) ?? "";

    // Neither marker appears anywhere in the area — not as a title, not as a
    // preview, not as a link label.
    expect(text).not.toContain(ENTRY_MARKER);
    expect(text).not.toContain(TASK_MARKER);

    /*
      **The fixture marker that proves the page rendered at all.** An absence
      assertion passes on a blank page, so it must be paired with something the
      page can only show if it really drew — here, the review's own prose, which
      DOES carry the task marker. If this fails, the absence above meant nothing.
    */
    await expect(page.locator(".review-content")).toContainText(TASK_MARKER);
  });

  test("2Q-TRUST-009: no control in the sources area does anything but link", async ({ page }) => {
    await openReview(page);
    const area = page.locator("section.review-detail-sources");
    await expect(area.locator("button, input, select, textarea, details, summary, [role='button']"))
      .toHaveCount(0);
    // The control that the scan can see: the page HAS buttons elsewhere.
    await expect(page.locator("button, a").first()).toBeVisible();
  });

  test("2Q-LINK-004: a task named in the prose but not linked stays prose", async ({ page }) => {
    await openReview(page);
    const content = page.locator(".review-content");
    await expect(content).toContainText(`Fechar o contrato ${TASK_MARKER}`);
    // No anchor was born from the name. The prose contains no link at all here.
    await expect(content.locator("a")).toHaveCount(0);
    // Two-sided: the SAME task is linked in the sources area, so the absence
    // above is about name matching rather than about a resolver that did nothing.
    await expect(page.locator(`a[href="/pt-BR/app/work/${fixture.taskId}"]`)).toHaveCount(1);
  });

  test("a removed record degrades to words rather than to a broken link", async ({ page }) => {
    await openReview(page);
    // The deleted task's row exists, carries the same kind label as the live
    // one, and carries NO anchor.
    const gone = page.locator("li.review-cited-row", { hasText: "Não está mais disponível" });
    await expect(gone).toHaveCount(1);
    await expect(gone.locator("a")).toHaveCount(0);
    await expect(gone.locator(".review-cited-kind")).toHaveText("Tarefa");
    // And no link anywhere on the page points at the deleted id.
    await expect(page.locator(`a[href*="${fixture.goneTaskId}"]`)).toHaveCount(0);
  });

  test("the cited items are keyboard reachable", async ({ page }) => {
    /*
      Structure and focus only. **Nothing here is a screen-reader claim** —
      `2P-ACCESS-005` stays WAIVED, NOT PASSED, and no assertion in this phase
      may be reported as screen-reader evidence.
    */
    await openReview(page);
    const link = page.locator(`a[href="/pt-BR/app/work/${fixture.taskId}"]`);
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/pt-BR/app/work/${fixture.taskId}$`));
  });

  test("it reads the same way in English", async ({ page }) => {
    await openReview(page, "en");
    const taskRow = page.locator(`li.review-cited-row:has(a[href="/en/app/work/${fixture.taskId}"])`);
    await expect(taskRow).toHaveCount(1);
    await expect(taskRow.locator(".review-cited-kind")).toHaveText("Task");
    await expect(page.locator("section.review-detail-sources")).not.toContainText(TASK_MARKER);
  });
});
