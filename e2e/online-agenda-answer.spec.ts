import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Life Brain B.1 (`LB-B-005`) — an agenda question answered with no model.
 *
 * Runs against the linked live database with a disposable account created and
 * deleted here, the mechanism `online-assistant-composer.spec.ts` established.
 * The account is given **no** BYOK credential on purpose: every knowledge
 * answer would refuse with `awaiting_ai_configuration`, so an answer that
 * reaches the thread proves the agenda route passed no gate and called no
 * provider. One task is seeded for the disposable account only — never for the
 * owner's test account — and the account's deletion cascades it away.
 *
 * **Two items, not one.** `tasks_create_due_reminder` (`202607160007`) gives
 * every task inserted with a `due_at` a reminder one hour earlier, and the
 * calendar projection shows both. The first run of this spec expected one item
 * and was wrong about the product, not the other way round: the answer must say
 * what the Agenda shows.
 *
 * Evidence: set `LIFE_BRAIN_EVIDENCE=docs/reports/life-brain/evidence/slice-b1`
 * to keep the screenshots.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);
const evidence = process.env.LIFE_BRAIN_EVIDENCE?.trim() || null;

const TASK_TITLE = "Levar o carro na revisão";

const strings = {
  "pt-BR": {
    composerLabel: "O que você quer dizer ao Brain?",
    submit: "Enviar",
    tomorrow: "O que tenho amanhã?",
    dayAfter: "O que tenho depois de amanhã?",
    found: "Amanhã, você tem 2 itens na agenda:",
    reminderLane: "lembrete",
    deadlineLane: "prazo",
    empty: "Não encontrei nada na sua agenda depois de amanhã.",
    reach: "Olhei só a sua agenda: tarefas com prazo ou planejadas e lembretes nesse período.",
    insufficient: "Nada na sua agenda nesse período.",
  },
  en: {
    composerLabel: "What do you want to tell Brain?",
    submit: "Send",
    tomorrow: "What do I have tomorrow?",
    dayAfter: "What do I have the day after tomorrow?",
    found: "Tomorrow, you have 2 items on your agenda:",
    reminderLane: "reminder",
    deadlineLane: "deadline",
    empty: "I found nothing on your agenda the day after tomorrow.",
    reach: "I looked only at your agenda: tasks due or planned and reminders in that period.",
    insufficient: "Nothing on your agenda in that period.",
  },
} as const;

/** Tomorrow at 15:00 in São Paulo, the zone a new profile defaults to. */
function tomorrowAfternoonInSaoPaulo(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year!, month! - 1, day! + 1));
  const iso = tomorrow.toISOString().slice(0, 10);
  // São Paulo has kept a fixed -03:00 offset since 2019.
  return `${iso}T15:00:00-03:00`;
}

async function admin(pathname: string, init: RequestInit = {}) {
  return fetch(`${supabaseUrl}${pathname}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

test.describe("Life Brain B.1 — the agenda answers without a model", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-agenda-${crypto.randomUUID()}@example.com`;
  let userId: string | undefined;

  test.beforeAll(async () => {
    const created = await admin("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password: `Agenda!${crypto.randomUUID()}A7`,
        email_confirm: true,
        user_metadata: { display_name: "Agenda E2E" },
      }),
    });
    expect(created.ok).toBe(true);
    userId = ((await created.json()) as { id: string }).id;

    const seeded = await admin("/rest/v1/tasks", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({ user_id: userId, title: TASK_TITLE, status: "todo", due_at: tomorrowAfternoonInSaoPaulo() }),
    });
    expect(seeded.ok, await seeded.clone().text()).toBe(true);
  });

  // Fail-closed: the disposable account is removed whatever the journey did.
  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    expect(deletion.ok).toBe(true);
  });

  for (const locale of ["pt-BR", "en"] as const) {
    test(`answers tomorrow from the calendar, and an empty day plainly — ${locale}`, async ({ page }, testInfo) => {
      const text = strings[locale];
      await signInOnline(page, { email, locale });

      await page.goto(`/${locale}/app/chat`);
      await page.getByLabel(text.composerLabel).fill(text.tomorrow);
      await page.getByRole("button", { name: text.submit }).click();

      await expect(page).toHaveURL(new RegExp(`/${locale}/app/chat/[0-9a-f-]+$`), { timeout: 60_000 });
      const answer = page.locator(".chat-message.assistant").last();
      await expect(answer.locator(".chat-message-body")).toContainText(text.found);
      await expect(answer.locator(".chat-message-body")).toContainText(`14:00 · ${TASK_TITLE} · ${text.reminderLane}`);
      await expect(answer.locator(".chat-message-body")).toContainText(`15:00 · ${TASK_TITLE} · ${text.deadlineLane}`);
      // Where it looked, said for the agenda — not "records and memories only".
      await expect(answer.getByText(text.reach)).toBeVisible();
      // The task is a navigable source, carrying no title in the card; the
      // reminder is listed and not cited (ADR-146 Decision 2).
      await expect(answer.locator(`a[href^="/${locale}/app/work/"]`)).toHaveCount(1);
      // No model answered, so no model id is printed under the message.
      await expect(answer.locator("xpath=./small")).toHaveCount(0);

      if (evidence) {
        mkdirSync(evidence, { recursive: true });
        await page.screenshot({
          path: path.join(evidence, `agenda-tomorrow-${locale}-${testInfo.project.name}.png`),
          fullPage: true,
        });
      }

      // The same thread, an empty window.
      await page.getByLabel(text.composerLabel).fill(text.dayAfter);
      await page.getByRole("button", { name: text.submit }).click();
      const empty = page.locator(".chat-message.assistant").last();
      await expect(empty.locator(".chat-message-body")).toHaveText(text.empty, { timeout: 60_000 });
      await expect(empty.getByText(text.insufficient)).toBeVisible();

      if (evidence) {
        await page.screenshot({
          path: path.join(evidence, `agenda-empty-${locale}-${testInfo.project.name}.png`),
          fullPage: true,
        });
      }
    });
  }

  test("charged nothing: the account has no AI usage row", async () => {
    // Read after both journeys ran. A ledger the service role cannot read is
    // reported as a failure rather than taken as "zero rows".
    test.skip(!userId, "The disposable account was not created.");
    const usage = await admin(`/rest/v1/ai_usage_events?select=id&user_id=eq.${userId}`);
    expect(usage.ok, await usage.clone().text()).toBe(true);
    expect(await usage.json()).toEqual([]);
  });
});
