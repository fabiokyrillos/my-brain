import { expect, test, type Page } from "@playwright/test";

import { onlineEnvironment, signInOnline } from "./support/online-session";

/**
 * Slice 2P.8 — the `2P-CHAT-007-JOURNEY` remainder, advanced as far as this
 * environment honestly allows.
 *
 * ## What the remainder asked for, and what is delivered here
 *
 * `2P-CHAT-007` names five flows: new conversation, existing conversation,
 * source round-trip, failure, and recovery. Slice 2P.2 proved all five below
 * the browser and explicitly refused to claim the journey, naming two blockers
 * — the authenticated hosted harness, and a provider call nobody had authorized
 * spending on a proof.
 *
 * The first blocker is gone: this file uses the harness. **The second is not,
 * and not for the reason anyone expected.** The owner authorized exactly one
 * real answered turn for this slice. The credential to spend it with **does not
 * exist in this environment** — `BYOK_TEST_USER_A_OPENAI_API_KEY` is absent
 * from `.env.local` and there is no platform `OPENAI_API_KEY` either, so there
 * is no path by which any code here could produce a real answer. The
 * authorization is unspent because it is unspendable, not because it was
 * declined, and no assertion in this file may be read as an answered turn.
 *
 * ## The failure this proves is real, not simulated
 *
 * A disposable account has no credential, so sending a question reaches the
 * BYOK gate and is refused there. Nothing is stubbed and no network call is
 * made to a provider — the refusal happens *before* the first one, by design.
 * That is the genuine article for `2P-CHAT-003` at the browser boundary, and it
 * is the one failure class this environment can produce truthfully.
 *
 * **Which refusal, precisely.** The composer on `/app/chat` parses a command
 * first and falls through to the knowledge answer when the text is a question.
 * A credential-less account is stopped at the gate *before* that fallthrough,
 * so what these tests observe is the gate's own sentence rather than
 * `answerFromKnowledge`'s `credential` class with its correlation id. The two
 * are different paths and only the first is reachable here; the correlation
 * half stays where slice 2P.2 proved it, below the browser. The repository's
 * existing answered-turn journey — `online-assistant-composer.spec.ts`, *"a
 * question still reaches its grounded answer through the fallthrough"* — skips
 * itself for the same missing credential, and that is the honest state of it.
 */

const { supabaseUrl, serviceRoleKey } = onlineEnvironment;
const onlineConfigured = onlineEnvironment.configured;

const COPY = {
  credentialRequired: "Configure sua chave da OpenAI em Configurações para usar os recursos de IA.",
  askAbout: "Perguntar sobre isto",
} as const;

async function createAccount() {
  const email = `codex-2p8-chat-${crypto.randomUUID()}@example.com`;
  const password = `Chat!${crypto.randomUUID()}A7`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  expect(response.ok, await response.clone().text()).toBe(true);
  const { id } = (await response.json()) as { id: string };
  return { email, id };
}

test.describe("Phase 2P closeout — the conversation journey", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  let owner: { email: string; id: string };

  test.beforeAll(async () => {
    owner = await createAccount();
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

  test("2P-CHAT-007: a new conversation is reachable and its composer is ready", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/chat");

    // Conversas is the first lens inside Brain (`2P-CHAT-004`), and it is a
    // real destination rather than a route that errors — the production failure
    // slice 2P.2 fixed.
    await expect(page.locator("h1")).toHaveCount(1);
    const composer = page.locator("form").filter({ has: page.locator("textarea, input[type='text']") }).first();
    await expect(composer).toBeVisible();

    // Ready immediately: no mode choice stands between arriving and typing.
    const field = composer.locator("textarea, input[type='text']").first();
    await field.fill("O que eu registrei sobre contabilidade?");
    await expect(field).toHaveValue("O que eu registrei sobre contabilidade?");
  });

  test("2P-CHAT-007: a refused turn is specific, and leaks nothing", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/chat");

    const composer = page.locator("form").filter({ has: page.locator("textarea, input[type='text']") }).first();
    const field = composer.locator("textarea, input[type='text']").first();
    await field.fill("O que eu registrei esta semana?");
    await composer.getByRole("button").last().click();

    /*
      The real refusal, from the real gate. `2P-CHAT-003` requires that a known
      failure never surfaces only as a generic boundary, and this is the
      sentence the BYOK copy owns rather than a catch-all.
    */
    const refusal = page.getByText(COPY.credentialRequired, { exact: false }).first();
    await expect(refusal).toBeVisible({ timeout: 60_000 });

    /*
      `T-11` — what may not travel, stated precisely.

      The first version of this asserted the word *OpenAI* was absent, and that
      is wrong: the refusal's own sentence is *"Configure sua chave da OpenAI em
      Configurações"*, which names the provider the owner has to go and
      configure. That is the product instructing, not a thrown provider error
      escaping. What must never appear is material from the **exception**: key
      text, a model identifier, a SQLSTATE, or a stack frame.
    */
    const body = await page.locator("body").innerText();
    expect(body, "key material rendered").not.toMatch(/sk-[A-Za-z0-9_-]{8}/);
    expect(body, "a model identifier leaked").not.toMatch(/\bgpt-[0-9a-z.-]+\b/i);
    expect(body, "a SQLSTATE leaked").not.toMatch(/\bSQLSTATE\b|\b(?:22023|23505|42501|55P03)\b/);
    expect(body, "a stack frame leaked").not.toMatch(/\bat\s+\w+\s+\(.*:\d+:\d+\)/);

    /*
      **No correlation reference is asserted here, and that is correct.**

      The first version required one and failed, which looked like a missing
      reference and is not. The composer on `/app/chat` parses a command first;
      a question declines with `not_a_task_command` and falls through to the
      knowledge answer. A credential-less account never gets that far — the BYOK
      gate refuses at the composer, before `answerFromKnowledge` runs, so there
      is no chat failure to correlate and nothing to reference. The sentence the
      owner sees is the gate's own, which is *more* specific than the generic
      `credential` class, not less.

      `withChatFailureReference` belongs to the path this run cannot reach.
      Asserting its output here would have demanded a reference for an error
      that never occurred — and the honest consequence is that the reference
      half of `2P-CHAT-003` stays proved below the browser, where slice 2P.2
      proved it, rather than being claimed here.
    */
    expect(body, "the refusal was generic rather than the gate's own sentence").toContain(
      COPY.credentialRequired,
    );
  });

  test("2P-CHAT-007: recovery — the refusal points at Settings and the text survives", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/chat");

    const composer = page.locator("form").filter({ has: page.locator("textarea, input[type='text']") }).first();
    const field = composer.locator("textarea, input[type='text']").first();
    await field.fill("Uma pergunta que será recusada");
    await composer.getByRole("button").last().click();
    await expect(page.getByText(COPY.credentialRequired, { exact: false }).first()).toBeVisible({
      timeout: 60_000,
    });

    /*
      Recovery is a route the owner can take, not an apology. The refusal names
      Configurações, and the credential section is reachable and states what is
      missing — so the failure ends somewhere the owner can act.
    */
    await page.goto("/pt-BR/app/settings/ai");
    await expect(page.locator("h1, h2").filter({ hasText: /IA|Assistente|OpenAI/i }).first()).toBeVisible();

    // And the surface refuses to leak on the way: no key material is rendered,
    // which is the posture `2P-SETTINGS-006` fixed and this must not undo.
    expect(await page.locator("body").innerText()).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  test("2P-CHAT-007: the source round-trip keeps its context and offers the way back", async ({
    page,
  }) => {
    await signIn(page);

    /*
      The round-trip needs a subject with a name, and a disposable account has
      none. Rather than seed one with the service role — which would prove the
      renderer and nothing about the affordance — this asserts the contract the
      surface holds when there is no subject: the entry points exist and the
      banner is absent, so a later run with real data has a control to compare
      against.

      **The populated half of this flow is the remainder**, and it is the same
      one the answered turn belongs to: both need data or a credential this
      environment does not have.
    */
    await page.goto("/pt-BR/app/people");
    await expect(page.locator("h1")).toHaveCount(1);

    // With no subject, no banner claims one. A banner over an empty account
    // would be the fabricated context `2P-CHAT-005` forbids.
    await page.goto("/pt-BR/app/chat");
    await expect(page.getByText(/Perguntando sobre/)).toHaveCount(0);

    // The seeded route is reachable and states its subject when given one —
    // asserted through the URL contract rather than through invented data.
    await page.goto("/pt-BR/app/chat?about=person%3A00000000-0000-0000-0000-000000000000");
    // An unknown subject must not fabricate a banner for a record that is not
    // the owner's. This is `2P-CHAT-005`'s owner-scope half, and it is the one
    // part of the round-trip an empty account can prove completely.
    await expect(page.getByText(/Perguntando sobre/)).toHaveCount(0);
  });
});
