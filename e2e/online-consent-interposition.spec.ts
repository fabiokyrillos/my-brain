import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * SH.4 deployed acceptance — versioned consent, interposed and enforced
 * (SH-LEGAL-004/006/008/009/010/011).
 *
 * ## The claim under test is not "a modal appears"
 *
 * `policy_acceptances` is directly insertable by `authenticated`, so the whole
 * consent gate is only as strong as what PostgREST refuses. Three of the checks
 * below never touch the browser for that reason: a forged **future** version, a
 * **stale** version, and the gate's independence from anything the client
 * stores. If those hold, clearing cookies or hand-crafting an INSERT buys
 * nothing; if they do not, the interposition is decoration.
 *
 * ## The version bump is simulated per-account, never globally
 *
 * A real bump is a migration plus `versions.ts` in the same commit (ADR-079)
 * and re-interposes consent for **every** account. Doing that to exercise a
 * journey would be a production legal event staged for a test. Instead this
 * spec removes one disposable account's acceptance rows with the service role —
 * a capability no client has — which puts that account in precisely the state a
 * bump puts it in: holding no acceptance at the current version. The gate's
 * predicate cannot tell the two apart, because it asks exactly that question.
 * The distinction is recorded rather than glossed: a real bump leaves a stale
 * row behind, this leaves none, and both fail the same predicate.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

type Copy = {
  readonly locale: "pt-BR" | "en";
  readonly emailLabel: string;
  readonly passwordLabel: string;
  readonly signIn: string;
  readonly interpositionTitle: string;
  readonly firstSessionBody: string;
  readonly updatedBody: string;
  readonly accept: string;
  readonly declineTitle: string;
  readonly declineSignOut: string;
  readonly declineDelete: string;
};

const COPIES: readonly Copy[] = [
  {
    locale: "pt-BR",
    emailLabel: "E-mail",
    passwordLabel: "Senha",
    signIn: "Entrar",
    interpositionTitle: "Antes de continuar",
    firstSessionBody: "Para usar o produto, é preciso aceitar",
    updatedBody: "Os documentos mudaram desde o seu último aceite",
    accept: "Aceitar e continuar",
    declineTitle: "Se você não quiser aceitar",
    declineSignOut: "Sair da conta",
    declineDelete: "Excluir a conta",
  },
  {
    locale: "en",
    emailLabel: "E-mail",
    passwordLabel: "Password",
    signIn: "Sign in",
    interpositionTitle: "Before you continue",
    firstSessionBody: "To use the product you need to accept",
    updatedBody: "The documents have changed since you last accepted",
    accept: "Accept and continue",
    declineTitle: "If you would rather not accept",
    declineSignOut: "Sign out",
    declineDelete: "Delete the account",
  },
];

const admin = () =>
  createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

for (const COPY of COPIES) {
  test.describe(`SH.4 — consent interposition (${COPY.locale})`, () => {
    test.describe.configure({ mode: "serial" });
    test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

    const email = `sh4-journey-${COPY.locale}-${crypto.randomUUID()}@mybrain.com`;
    const password = `Sh4!${crypto.randomUUID()}a7`;
    let userId = "";
    let accessToken = "";

    const asUser = () =>
      createClient(supabaseUrl!, publishableKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });

    async function acceptanceRows() {
      const { data } = await admin()
        .from("policy_acceptances")
        .select("document,version,surface")
        .eq("user_id", userId);
      return (data ?? []) as { document: string; version: string; surface: string }[];
    }

    async function signIn(page: Page) {
      await page.goto(`/${COPY.locale}/auth/login`);
      await page.getByLabel(COPY.emailLabel).fill(email);
      await page.getByLabel(COPY.passwordLabel).fill(password);
      await page.getByRole("button", { name: COPY.signIn }).click();
    }

    test.beforeAll(async () => {
      const created = await admin().auth.admin.createUser({ email, password, email_confirm: true });
      expect(created.error).toBeNull();
      userId = created.data.user!.id;

      const anon = createClient(supabaseUrl!, publishableKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const session = await anon.auth.signInWithPassword({ email, password });
      expect(session.error).toBeNull();
      accessToken = session.data.session!.access_token;
    });

    test.afterAll(async () => {
      if (userId) await admin().auth.admin.deleteUser(userId).catch(() => undefined);
    });

    test("a forged future version and a stale version are both refused by PostgREST", async () => {
      // The account has accepted nothing, which is the state in which
      // pre-accepting a version that does not exist yet would be most useful to
      // an attacker: it would satisfy the gate forever.
      const forged = await asUser().from("policy_acceptances").insert({
        user_id: userId,
        document: "terms",
        version: "9999-12-31",
        surface: "interposition",
      });
      expect(forged.error, "a future version must not be insertable").not.toBeNull();

      const stale = await asUser().from("policy_acceptances").insert({
        user_id: userId,
        document: "terms",
        version: "2000-01-01",
        surface: "interposition",
      });
      expect(stale.error, "a stale version must not be insertable").not.toBeNull();

      // Both refusals use the same sentence, and neither says which way the
      // version was wrong. The submitted value is echoed — that is the caller's
      // own input and discloses nothing — but the CURRENT version never appears,
      // which is what stops the endpoint being a version oracle a prober could
      // walk to a valid pre-acceptance.
      const template = (message: string, submitted: string) =>
        message.replace(submitted, "<submitted>");
      expect(template(forged.error!.message, "9999-12-31")).toBe(
        template(stale.error!.message, "2000-01-01"),
      );

      const { data: current } = await admin()
        .from("policy_acceptances")
        .select("version")
        .limit(1);
      const currentVersion = (current?.[0] as { version?: string } | undefined)?.version;
      if (currentVersion) {
        expect(forged.error!.message).not.toContain(currentVersion);
        expect(stale.error!.message).not.toContain(currentVersion);
      }

      expect(await acceptanceRows()).toEqual([]);
    });

    test("first session is interposed, and the decline path offers sign-out and deletion", async ({
      page,
    }) => {
      await signIn(page);

      await expect(page.getByRole("heading", { name: COPY.interpositionTitle })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(COPY.firstSessionBody)).toBeVisible();

      // The decline path has to be a real way out, not a dead end.
      await expect(page.getByText(COPY.declineTitle)).toBeVisible();
      await expect(page.getByRole("button", { name: COPY.declineSignOut })).toBeVisible();
      const deleteLink = page.getByRole("link", { name: COPY.declineDelete });
      await expect(deleteLink).toBeVisible();
      await expect(deleteLink).toHaveAttribute("href", `/${COPY.locale}/account/delete`);

      // A deep link does not get around it, and neither does having no cookies:
      // the gate is a server-side read of `policy_acceptances`.
      await page.goto(`/${COPY.locale}/app/tasks`);
      await expect(page.getByRole("heading", { name: COPY.interpositionTitle })).toBeVisible({
        timeout: 20_000,
      });
    });

    test("accepting in this locale records the current version and opens the product", async ({
      page,
    }) => {
      await signIn(page);
      await expect(page.getByRole("heading", { name: COPY.interpositionTitle })).toBeVisible({
        timeout: 30_000,
      });

      await page.getByRole("button", { name: COPY.accept }).click();
      await expect(page).toHaveURL(new RegExp(`/${COPY.locale}/app`), { timeout: 30_000 });

      const rows = await acceptanceRows();
      expect(rows.map((r) => r.document).sort()).toEqual(["privacy", "terms"]);
      for (const row of rows) {
        expect(row.surface).toBe("interposition");
        // The version is the server's, never the client's.
        expect(row.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }

      // Normal product access, not merely "not redirected".
      await page.goto(`/${COPY.locale}/app/tasks`);
      await expect(page.getByRole("heading", { name: COPY.interpositionTitle })).toHaveCount(0);
    });

    test("the gate ignores client state entirely", async ({ page }) => {
      await signIn(page);
      await expect(page).toHaveURL(new RegExp(`/${COPY.locale}/app`), { timeout: 30_000 });

      // Whatever the client claims about consent is irrelevant: the acceptance
      // rows are removed server-side and the very next request is interposed,
      // with the client's storage left deliberately untouched and asserting the
      // opposite.
      await page.evaluate(() => {
        localStorage.setItem("policies-accepted", "true");
        document.cookie = "policies_accepted=true; path=/";
      });

      const { error } = await admin().from("policy_acceptances").delete().eq("user_id", userId);
      expect(error).toBeNull();
      expect(await acceptanceRows()).toEqual([]);

      // This is the version-bump behaviour, simulated per-account: the gate's
      // question is "is there an acceptance at the CURRENT version", and there
      // is not.
      await page.goto(`/${COPY.locale}/app`);
      await expect(page.getByRole("heading", { name: COPY.interpositionTitle })).toBeVisible({
        timeout: 30_000,
      });

      // Re-accepting restores access, so the bump is a speed bump and not a
      // lockout.
      await page.getByRole("button", { name: COPY.accept }).click();
      await expect(page).toHaveURL(new RegExp(`/${COPY.locale}/app`), { timeout: 30_000 });
      expect((await acceptanceRows()).length).toBe(2);
    });
  });
}
