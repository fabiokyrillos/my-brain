import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice E's authenticated acceptance for the unified composer (UX-07).
 *
 * Runs against the linked live database with a disposable account created and
 * deleted by the deployment-session harness — the same mechanism
 * `online-mobile-navigation.spec.ts` established. Credentials never appear in
 * source, in a fixture name or in an assertion.
 *
 * The order of the cases is chosen around cost as well as coverage. Everything
 * up to the last case is **deterministic**: the composer's structure, the
 * submission refusals and the proposed-memory route all resolve without a
 * provider call, so the expensive evidence is spent once, on the one thing only
 * a live round can prove — that a question still reaches its grounded answer
 * through the `not_a_task_command` fallthrough rather than through a second
 * form.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const strings = {
  "pt-BR": {
    loginEmail: "E-mail",
    loginPassword: "Senha",
    loginSubmit: "Entrar",
    composerLabel: "O que você quer dizer ao Brain?",
    submit: "Enviar",
    hint: "Enter envia · Shift+Enter quebra a linha",
    memoryText: "Lembre disso sempre: eu reviso faturas às sextas",
    // What the product renders (`memories/copy.ts` → `proposalHeading`), which
    // stopped being Slice E's string when G3 added the confirm-before-remember
    // step. See the note on the assertion below.
    memoryHeading: "Quer que eu guarde isto?",
    memoryNextStep: "Criar essa memória em Memórias",
    proposalContentLabel: "Memória",
    proposalContent: "eu reviso faturas às sextas",
    proposalKindLabel: "Tipo",
    proposalConfirm: "Guardar memória",
    proposalDiscard: "Descartar",
    echoLabel: "Você escreveu",
    emptyHeading: "Escreva algo primeiro",
    memoriesPath: "/pt-BR/app/memories",
    emptyMemories: "Nenhuma memória ainda",
  },
  en: {
    // Not localized: the login form renders the literal `E-mail` in both
    // locales, as `account-session.spec.ts` already records.
    loginEmail: "E-mail",
    loginPassword: "Password",
    loginSubmit: "Sign in",
    composerLabel: "What do you want to tell Brain?",
    submit: "Send",
    hint: "Enter sends · Shift+Enter adds a line",
    memoryText: "Remember this always: I review invoices on Fridays",
    memoryHeading: "Want me to keep this?",
    memoryNextStep: "Create this memory in Memories",
    proposalContentLabel: "Memory",
    proposalContent: "I review invoices on Fridays",
    proposalKindLabel: "Type",
    proposalConfirm: "Keep memory",
    proposalDiscard: "Discard",
    echoLabel: "You wrote",
    emptyHeading: "Write something first",
    memoriesPath: "/en/app/memories",
    emptyMemories: "No memories yet",
  },
} as const;

test.describe("the unified composer", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-composer-${crypto.randomUUID()}@example.com`;
  const password = `Composer!${crypto.randomUUID()}A7`;
  let userId: string | undefined;

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
        user_metadata: { display_name: "Composer E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  // Fail-closed: the disposable account is removed whatever the journey did, so
  // a failing assertion cannot leave a user behind.
  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  for (const locale of ["pt-BR", "en"] as const) {
    test(`presents one composer and routes without a mode switch — ${locale}`, async ({ page }, testInfo) => {
      const text = strings[locale];
      const mobile = testInfo.project.name === "mobile";

      await signInOnline(page, { email, locale });

      await page.goto(`/${locale}/app/chat`);

      // UX-07's acceptance, asserted structurally: the page carries exactly one
      // permanent primary text field. Before Slice E it carried two, plus a
      // third inside each proactive question card.
      const composer = page.getByLabel(text.composerLabel);
      await expect(composer).toBeVisible();
      await expect(page.locator(".assistant-composer-form textarea")).toHaveCount(1);
      await expect(page.locator(".chat-form")).toHaveCount(0);
      await expect(page.locator(".task-command-form")).toHaveCount(0);

      // No mode to choose before typing (DEC-3).
      await expect(page.locator(".assistant-composer").getByRole("radiogroup")).toHaveCount(0);
      await expect(page.locator(".assistant-composer").getByRole("combobox")).toHaveCount(0);

      await expect(page.getByText(text.hint)).toBeVisible();

      const submit = page.getByRole("button", { name: text.submit });
      if (mobile) {
        // 44×44 on both controls, and the composer must not overflow the
        // viewport at Pixel 7's width.
        const submitBox = await submit.boundingBox();
        expect(submitBox?.height ?? 0).toBeGreaterThanOrEqual(44);
        const composerBox = await composer.boundingBox();
        expect(composerBox?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect((await page.locator("body").boundingBox())?.width ?? 0)
          .toBeLessThanOrEqual(page.viewportSize()!.width);
      }

      // An empty submission is refused before any provider call, with localized
      // copy rather than a browser-default bubble.
      await composer.fill("   ");
      await submit.click();
      // Addressed by role: the same sentence is also in the polite live region,
      // which is the announcement working rather than a duplicate to avoid.
      await expect(page.getByRole("heading", { name: text.emptyHeading }))
        .toBeVisible({ timeout: 30_000 });

      // The proposed-memory route (DEC-5): recognised without a provider call,
      // it names what was understood, echoes what the user wrote, and offers a
      // link rather than anything that could persist.
      await composer.fill(text.memoryText);
      await submit.click();
      const notice = page.locator(".assistant-composer-notice");
      await expect(notice).toBeVisible({ timeout: 30_000 });
      await expect(notice).toHaveAttribute("data-route", "memory_intent");
      /**
       * This assertion had been red since Slice G3 and nobody had run it (UX-35).
       *
       * Slice E wrote it against `assistant/copy.ts`'s `memoryHeading`. G3 added
       * the confirm-before-remember step and moved the rendered heading to
       * `memories/copy.ts`'s `proposalHeading` — "Quer que eu guarde isto?" —
       * without updating the journey that asserts it. G4 and G5 each ran only
       * their own online specs, so four slices passed with this red.
       *
       * `assistant/copy.ts`'s `memoryHeading` is deleted in the same change: a
       * declared, localized string with no consumer is exactly UX-19's defect,
       * and leaving it would let this diverge again.
       */
      await expect(notice.getByRole("heading", { name: text.memoryHeading })).toBeVisible();
      await expect(notice.getByText(text.echoLabel)).toBeVisible();

      /**
       * G3 replaced Slice E's "go to Memories" link with the confirm control
       * DEC-5 required, and `actions.ts:161` sets `nextStep: null` whenever
       * there is a proposal to show — the link now appears only on the opener
       * with nothing after it, where there is no memory to offer. Asserting the
       * card is asserting the product; asserting the link was asserting Slice E.
       */
      await expect(notice.getByRole("textbox", { name: text.proposalContentLabel }))
        .toHaveValue(text.proposalContent);
      await expect(notice.getByRole("combobox", { name: text.proposalKindLabel })).toBeVisible();
      await expect(notice.getByRole("button", { name: text.proposalConfirm })).toBeVisible();
      await expect(notice.getByRole("button", { name: text.proposalDiscard })).toBeVisible();

      // Nothing was written. The memories surface still renders its empty state
      // for this account, which is the whole of DEC-5's guarantee: reaching the
      // proposal has stored nothing, and only the confirm control can.
      await page.goto(text.memoriesPath);
      await expect(page.locator(".list-row")).toHaveCount(0);
      await expect(page.getByText(text.emptyMemories)).toBeVisible();
    });
  }

  test("a question still reaches its grounded answer through the fallthrough", async ({ page }) => {
    // The one case in this file that is a **provider** call, and therefore the
    // one gated on a credential. Under BYOK the answer is produced with the
    // account's own key; a disposable account has none, so without
    // `BYOK_TEST_USER_A_OPENAI_API_KEY` the product correctly refuses with
    // `awaiting_ai_configuration` and this journey would be asserting the
    // refusal rather than the fallthrough. Skipped honestly instead of retried.
    test.skip(
      !process.env.BYOK_TEST_USER_A_OPENAI_API_KEY,
      "No disposable BYOK product credential is provisioned; the grounded answer needs a provider call.",
    );
    // Longer than the lane's own budget: this waits on a live model round.
    test.setTimeout(240_000);
    const text = strings["pt-BR"];

    await signInOnline(page, { email, locale: "pt-BR" });

    await page.goto("/pt-BR/app/chat");
    await page.getByLabel(text.composerLabel).fill("O que eu combinei com a Marina?");
    await page.getByRole("button", { name: text.submit }).click();

    // The command parse declines with `not_a_task_command`, the composer routes
    // to the knowledge answer, and the answer redirects into its thread — the
    // pre-Slice-E behaviour of a question, reached from the one field.
    await expect(page).toHaveURL(/\/pt-BR\/app\/chat\/[0-9a-f-]+$/, { timeout: 180_000 });
    await expect(page.locator(".chat-message.assistant")).toBeVisible();

    // And the thread carries the same one composer, not a second pair of fields.
    await expect(page.locator(".assistant-composer-form textarea")).toHaveCount(1);
    await expect(page.locator(".chat-form")).toHaveCount(0);
  });
});
