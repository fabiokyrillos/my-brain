import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 2F Slice 2F.3 — gate 6: manual task creation through the rendered form.
 *
 * The RPC-level probe (`scripts/phase-2f3-creation-probe.mjs`) proves the
 * contract. This proves the *surface*: that the same form, with the same entry
 * point and the same copy, still creates a task — and that the row it produces
 * now carries `created_by = 'user'` through the validated path rather than
 * through the deleted direct INSERT.
 *
 * 2F-CREATE-006 requires the UX be preserved, so this asserts the form's
 * existing accessible names and success copy in both locales rather than any
 * new affordance. There is nothing new to see, and that is the point.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const COPY = [
  {
    locale: "pt-BR" as const,
    emailLabel: "E-mail",
    passwordLabel: "Senha",
    signIn: "Entrar",
    field: "Nova tarefa",
    submit: "Adicionar nova tarefa",
    created: "Adicionado.",
  },
  {
    locale: "en" as const,
    emailLabel: "E-mail",
    passwordLabel: "Password",
    signIn: "Sign in",
    field: "New task",
    submit: "Add new task",
    created: "Added.",
  },
];

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
  expect(response.ok, `${init.method ?? "GET"} ${path}: ${await response.clone().text()}`).toBe(true);
  return (await response.json()) as Record<string, unknown>[];
}

test.describe("manual task creation through the validated contract", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-2f3-form-${crypto.randomUUID()}@example.com`;
  const password = `Form!${crypto.randomUUID()}A7`;
  let userId: string | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    if (!userId) return;
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
  });

  async function signIn(page: Page, copy: (typeof COPY)[number]) {
    await page.goto(`/${copy.locale}/auth/login`);
    await page.getByLabel(copy.emailLabel).fill(email);
    await page.getByLabel(copy.passwordLabel).fill(password);
    await page.getByRole("button", { name: copy.signIn }).click();
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/app$`), { timeout: 30_000 });
  }

  for (const copy of COPY) {
    test(`[${copy.locale}] the form creates a task with user provenance and no UX change`, async ({ page }) => {
      const title = `Tarefa manual ${crypto.randomUUID().slice(0, 8)}`;

      await signIn(page, copy);
      await page.goto(`/${copy.locale}/app/work?view=all`);

      // The same entry point and the same accessible names as before the slice.
      // `exact` matters: the field's label is "New task" and the submit button's
      // accessible name is "Add new task", and `getByLabel` substring-matches by
      // default — so the loose form resolves to both and fails strict mode.
      const field = page.getByLabel(copy.field, { exact: true });
      await expect(field).toBeVisible();
      await field.fill(title);
      await page.getByRole("button", { name: copy.submit }).click();

      await expect(page.getByText(copy.created)).toBeVisible({ timeout: 30_000 });

      const [task] = await admin(
        `tasks?user_id=eq.${userId}&title=eq.${encodeURIComponent(title)}`
        + "&select=created_by,status,due_at,planned_at,manual_priority,operation_key",
      );
      // 2F-CREATE-002 through the real surface.
      expect(task.created_by).toBe("user");
      expect(task.status).toBe("inbox");
      // Nothing was invented to satisfy a validator.
      expect(task.due_at).toBeNull();
      expect(task.planned_at).toBeNull();
      expect(task.manual_priority).toBeNull();
      // The validated path stamps the operation key; the deleted INSERT did not.
      expect(task.operation_key).not.toBeNull();

      const audits = await admin(
        `audit_logs?user_id=eq.${userId}&action_type=eq.task_command_created&select=actor&limit=5`,
      );
      expect(audits.length).toBeGreaterThan(0);
      expect(audits[0].actor).toBe("user");

      const undos = await admin(
        `undo_operations?user_id=eq.${userId}&action_type=eq.create_task_command&select=status&limit=5`,
      );
      expect(undos.length).toBeGreaterThan(0);
    });
  }
});
