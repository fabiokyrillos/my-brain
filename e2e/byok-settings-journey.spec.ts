import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * BYOK gate **C11** — the Settings credential journey, on real hardware
 * profiles, in both locales, against the deployed project.
 *
 * Every step here makes a real provider call, which is why this lane could not
 * run until the owner provisioned two disposable product credentials. It uses
 * **only** those: never the owner's credential, never
 * `BYOK_VALIDATION_OPENAI_API_KEY` (which `ADR-070` declares is not a product
 * credential), never a project-level key.
 *
 * The accounts are disposable and deleted in `finally`. Hosted signup stays
 * disabled: they are created through the admin API, which is the repository's
 * established authenticated fixture mechanism.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const keyA = process.env.BYOK_TEST_USER_A_OPENAI_API_KEY;
const keyB = process.env.BYOK_TEST_USER_B_OPENAI_API_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);
const credentialsConfigured = Boolean(keyA && keyB && keyA !== keyB);
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };

type Locale = "pt-BR" | "en";

const copy = {
  "pt-BR": {
    password: "Senha",
    signIn: "Entrar",
    heading: "Sua chave da OpenAI",
    fieldLabel: "Chave da API",
    save: "Salvar chave",
    rotate: "Substituir chave",
    remove: "Remover chave",
    statusConfigured: "Configurada",
    statusAbsent: "Nenhuma chave configurada",
    saved: "Chave salva e validada.",
    rotated: "Chave substituída e validada.",
    removed: "Chave removida.",
    shapeInvalid: "Formato de chave inválido.",
    invalidKey: "A OpenAI recusou esta chave.",
    neverShown: "Por segurança, a chave nunca é exibida depois de salva.",
    honesty:
      "A chave é guardada criptografada e nunca é exibida novamente. Remover é imediato no sistema ativo; cópias de backup expiram no prazo do provedor.",
    costs:
      "Os custos mostrados aqui são estimativas. O valor verdadeiro está no painel da sua conta OpenAI.",
    billing:
      "Os recursos de IA usam a sua própria chave da OpenAI. O uso é cobrado diretamente na sua conta da OpenAI.",
  },
  en: {
    password: "Password",
    signIn: "Sign in",
    heading: "Your OpenAI key",
    fieldLabel: "API key",
    save: "Save key",
    rotate: "Replace key",
    remove: "Remove key",
    statusConfigured: "Configured",
    statusAbsent: "No key configured",
    saved: "Key saved and validated.",
    rotated: "Key replaced and validated.",
    removed: "Key removed.",
    shapeInvalid: "Invalid key format.",
    invalidKey: "OpenAI rejected this key.",
    neverShown: "For safety, the key is never displayed after it is saved.",
    honesty:
      "The key is stored encrypted and is never shown again. Removal is immediate in the live system; backups age out on the provider's schedule.",
    costs:
      "The costs shown here are estimates. The authoritative figure is in your own OpenAI dashboard.",
    billing:
      "The AI features use your own OpenAI key. Usage is billed directly to your OpenAI account.",
  },
} as const;

type Disposable = { email: string; password: string; userId: string };

async function createDisposableUser(
  admin: SupabaseClient,
  locale: Locale,
  onCreated: (userId: string) => void,
): Promise<Disposable> {
  const suffix = crypto.randomUUID();
  const email = `byok-journey-${locale.toLowerCase()}-${suffix}@example.com`;
  const password = `Byok!${suffix}a7`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "BYOK journey" },
  });
  expect(error).toBeNull();
  if (!data.user) throw new Error("Disposable BYOK user was not created.");
  onCreated(data.user.id);

  const owner = createClient(supabaseUrl!, publishableKey!, clientOptions);
  const { error: signInError } = await owner.auth.signInWithPassword({ email, password });
  expect(signInError).toBeNull();
  const { error: profileError } = await owner
    .from("profiles")
    .update({ locale })
    .eq("user_id", data.user.id);
  expect(profileError).toBeNull();

  return { email, password, userId: data.user.id };
}

async function signIn(page: Page, user: Disposable, locale: Locale) {
  const text = copy[locale];
  await page.goto(`/${locale}/auth/login`);
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel(text.password, { exact: true }).fill(user.password);
  await page.getByRole("button", { name: text.signIn }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/app$`), { timeout: 30_000 });
}

function panel(page: Page) {
  return page.locator("section.byok-panel");
}

test.describe("BYOK Settings credential journey", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  test.skip(
    !credentialsConfigured,
    "The two disposable BYOK product credentials are not configured.",
  );
  test.setTimeout(300_000);

  for (const locale of ["pt-BR", "en"] as const) {
    test(`covers the whole credential lifecycle in ${locale}`, async ({ page }) => {
      const admin = createClient(supabaseUrl!, serviceRoleKey!, clientOptions);
      let disposableUserId: string | undefined;
      const text = copy[locale];

      try {
        const user = await createDisposableUser(admin, locale, (id) => {
          disposableUserId = id;
        });
        await signIn(page, user, locale);
        await page.goto(`/${locale}/app/settings`);

        const byok = panel(page);
        await expect(byok).toBeVisible();

        // ---- the no-key gated state -----------------------------------
        await expect(byok.getByText(text.statusAbsent)).toBeVisible();
        await expect(byok.getByRole("button", { name: text.save })).toBeVisible();
        await expect(byok.getByRole("button", { name: text.remove })).toHaveCount(0);

        // ---- honest disclosure, both required sentences ---------------
        await expect(byok.getByText(text.honesty)).toBeVisible();
        await expect(byok.getByText(text.billing)).toBeVisible();
        await expect(byok.getByText(text.costs)).toBeVisible();

        // ---- no reveal control, no prefill ----------------------------
        const field = byok.getByLabel(text.fieldLabel);
        await expect(field).toHaveAttribute("type", "password");
        await expect(field).toHaveValue("");
        await expect(byok.getByRole("button", { name: /show|mostrar|reveal|exibir/i })).toHaveCount(0);
        await expect(byok.getByText(text.neverShown)).toBeVisible();

        // ---- a malformed candidate never reaches the provider ---------
        await field.fill("not-a-key");
        await byok.getByRole("button", { name: text.save }).click();
        await expect(byok.getByRole("status")).toHaveText(text.shapeInvalid);
        const { data: afterShape } = await admin
          .from("user_ai_credentials")
          .select("user_id")
          .eq("user_id", user.userId);
        expect(afterShape ?? []).toEqual([]);

        // ---- save and live validation ---------------------------------
        await field.fill(keyA!);
        await byok.getByRole("button", { name: text.save }).click();
        await expect(byok.getByRole("status")).toHaveText(text.saved, { timeout: 60_000 });

        // ---- configured, metadata only --------------------------------
        await expect(byok.getByText(text.statusConfigured)).toBeVisible();
        // The display form from `formatFingerprint`, never the raw stored token.
        await expect(byok.locator("code")).toHaveText(/^(sk-proj|sk|unknown) · [0-9a-f]{6}$/);
        await expect(field).toHaveValue("");
        // The page must not contain the key anywhere, in any element.
        expect(await page.content()).not.toContain(keyA!);

        const { data: stored } = await admin
          .from("user_ai_credentials")
          .select("status,fingerprint,validated_at,key_version")
          .eq("user_id", user.userId)
          .single();
        expect(stored?.status).toBe("active");
        expect(stored?.validated_at).not.toBeNull();
        expect(stored?.key_version).toBe(1);

        // ---- an invalid candidate preserves the active credential -----
        await page.reload();
        await panel(page).getByLabel(text.fieldLabel).fill("sk-proj-thiskeyisnotrealatall000000");
        await panel(page).getByRole("button", { name: text.rotate }).click();
        await expect(panel(page).getByRole("status")).toHaveText(text.invalidKey, {
          timeout: 60_000,
        });
        const { data: preserved } = await admin
          .from("user_ai_credentials")
          .select("status,fingerprint")
          .eq("user_id", user.userId)
          .single();
        expect(preserved?.status).toBe("active");
        expect(preserved?.fingerprint).toBe(stored?.fingerprint);

        // ---- successful replacement -----------------------------------
        await page.reload();
        await panel(page).getByLabel(text.fieldLabel).fill(keyB!);
        await panel(page).getByRole("button", { name: text.rotate }).click();
        await expect(panel(page).getByRole("status")).toHaveText(text.rotated, {
          timeout: 60_000,
        });
        const { data: rotated } = await admin
          .from("user_ai_credentials")
          .select("status,fingerprint")
          .eq("user_id", user.userId)
          .single();
        expect(rotated?.status).toBe("active");
        expect(rotated?.fingerprint).not.toBe(stored?.fingerprint);

        // ---- removal, and immediate AI gating -------------------------
        page.once("dialog", (dialog) => dialog.accept());
        await panel(page).getByRole("button", { name: text.remove }).click();
        await expect(panel(page).getByRole("status")).toHaveText(text.removed, {
          timeout: 60_000,
        });
        await expect(panel(page).getByText(text.statusAbsent)).toBeVisible();
        const { data: removedRow } = await admin
          .from("user_ai_credentials")
          .select("status,ciphertext,iv")
          .eq("user_id", user.userId)
          .single();
        expect(removedRow?.status).toBe("removed");
        expect(removedRow?.ciphertext).toBeNull();
        expect(removedRow?.iv).toBeNull();

        // ---- reconfiguration restores it ------------------------------
        await page.reload();
        await panel(page).getByLabel(text.fieldLabel).fill(keyA!);
        await panel(page).getByRole("button", { name: text.save }).click();
        await expect(panel(page).getByRole("status")).toHaveText(text.saved, {
          timeout: 60_000,
        });
        await expect(panel(page).getByText(text.statusConfigured)).toBeVisible();

        // ---- keyboard reachability and responsive layout --------------
        await page.reload();
        const keyInput = panel(page).getByLabel(text.fieldLabel);
        await keyInput.focus();
        await expect(keyInput).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(panel(page).getByRole("button", { name: text.rotate })).toBeFocused();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
      } finally {
        if (disposableUserId) {
          const { error } = await admin.auth.admin.deleteUser(disposableUserId);
          expect(error).toBeNull();
        }
      }
    });
  }
});
