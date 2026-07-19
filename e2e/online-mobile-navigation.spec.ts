import { expect, test } from "@playwright/test";

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

test.describe("authenticated converged navigation", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-navigation-${crypto.randomUUID()}@example.com`;
  const password = `Navigation!${crypto.randomUUID()}A7`;
  let userId: string | undefined;
  let accessToken: string | undefined;

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
        user_metadata: { display_name: "Navigation E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey!, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(authResponse.ok).toBe(true);
    accessToken = ((await authResponse.json()) as { access_token: string }).access_token;
  });

  test.afterAll(async () => {
    if (!userId) return;
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });
  });

  test("keeps the same hierarchy reachable in both locales and viewports", async ({ page }, testInfo) => {
    await page.goto("/pt-BR/auth/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app$/, { timeout: 30_000 });

    for (const locale of ["pt-BR", "en"] as const) {
      const labels = locale === "pt-BR"
        ? {
            navigation: testInfo.project.name === "mobile" ? "Navegação móvel" : "Navegação principal",
            primaryGroup: "Principal",
            primary: ["Início", "Caixa", "Trabalho", "Brain"],
            more: "Mais",
            groups: ["Contexto", "Reflexão", "Organização", "Transparência", "Preferências"],
            notification: "Notificações",
            switchLanguage: "Mudar idioma para inglês",
            allSaved: "Tudo salvo",
            advanced: "IA avançada",
            costsLink: "Ver custos de IA",
            hiddenSettings: ["Resumo diário", "Nível de autonomia", "Privacidade padrão"],
            reviewsHeading: "Revisões",
            onDemandReview: "Gere uma revisão quando quiser; nada é executado por horário configurado.",
            secondary: [
              ["Projetos", "projects"],
              ["Pessoas", "people"],
              ["Memórias", "memories"],
              ["Arquivos", "files"],
              ["Revisões", "reviews"],
              ["Perguntas pendentes", "questions"],
              ["Lembretes", "reminders"],
              ["Histórico", "history"],
              ["Custos de IA", "costs"],
              ["Configurações", "settings"],
            ] as const,
          }
        : {
            navigation: testInfo.project.name === "mobile" ? "Mobile navigation" : "Main navigation",
            primaryGroup: "Primary",
            primary: ["Home", "Inbox", "Work", "Brain"],
            more: "More",
            groups: ["Context", "Reflection", "Organization", "Transparency", "Preferences"],
            notification: "Notifications",
            switchLanguage: "Switch language to Portuguese",
            allSaved: "All saved",
            advanced: "Advanced AI",
            costsLink: "View AI costs",
            hiddenSettings: ["Daily review", "Autonomy level", "Default privacy"],
            reviewsHeading: "Reviews",
            onDemandReview: "Generate a review when you choose; nothing runs from a configured schedule.",
            secondary: [
              ["Projects", "projects"],
              ["People", "people"],
              ["Memories", "memories"],
              ["Files", "files"],
              ["Reviews", "reviews"],
              ["Pending questions", "questions"],
              ["Reminders", "reminders"],
              ["History", "history"],
              ["AI costs", "costs"],
              ["Settings", "settings"],
            ] as const,
          };

      await page.goto(`/${locale}/app`);
      await expect(page.getByText(labels.allSaved, { exact: true })).toBeVisible();
      const attentionPanel = page.locator(".attention-panel");
      await attentionPanel.scrollIntoViewIfNeeded();
      await expect(attentionPanel).toBeVisible();
      const navigation = page.getByRole("navigation", { name: labels.navigation });
      await expect(navigation).toBeVisible();

      if (testInfo.project.name === "mobile") {
        for (const destination of labels.primary) {
          await expect(navigation.getByRole("link", { name: destination, exact: true })).toBeVisible();
        }
        await navigation.getByText(labels.more, { exact: true }).click();
      } else {
        const primary = navigation.getByRole("group", { name: labels.primaryGroup });
        for (const destination of labels.primary) {
          await expect(primary.getByRole("link", { name: destination, exact: true })).toBeVisible();
        }
      }

      for (const group of labels.groups) {
        await expect(navigation.getByRole("group", { name: group })).toBeVisible();
      }
      for (const [name, route] of labels.secondary) {
        await expect(navigation.getByRole("link", { name, exact: true })).toHaveAttribute(
          "href",
          `/${locale}/app/${route}`,
        );
      }
      if (testInfo.project.name === "mobile") {
        const touchTargets = await navigation.getByRole("link").evaluateAll((links) => (
          links
            .map((link) => link.getBoundingClientRect())
            .filter((box) => box.width > 0 && box.height > 0)
            .map((box) => ({ width: box.width, height: box.height }))
        ));
        const moreTarget = await navigation.locator("summary").boundingBox();
        expect(touchTargets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
        expect(moreTarget?.width).toBeGreaterThanOrEqual(44);
        expect(moreTarget?.height).toBeGreaterThanOrEqual(44);
        for (const globalControl of [
          page.getByRole("link", { name: labels.switchLanguage }),
          page.getByRole("link", { name: labels.notification }),
        ]) {
          const box = await globalControl.boundingBox();
          expect(box?.width).toBeGreaterThanOrEqual(44);
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
      }
      await expect(page.getByRole("link", { name: labels.notification })).toBeVisible();
      await expect(page.locator(`a[href="/${locale}/app/jobs"]`)).toHaveCount(0);

      await page.goto(`/${locale}/app/settings`);
      for (const hiddenSetting of labels.hiddenSettings) {
        await expect(page.getByLabel(hiddenSetting, { exact: true })).toHaveCount(0);
      }
      const advancedSummary = page.locator("summary").filter({ hasText: labels.advanced });
      const advancedBox = await advancedSummary.boundingBox();
      expect(advancedBox?.width).toBeGreaterThanOrEqual(44);
      expect(advancedBox?.height).toBeGreaterThanOrEqual(44);
      await advancedSummary.click();
      await expect(page.getByRole("link", { name: labels.costsLink })).toHaveAttribute("href", `/${locale}/app/costs`);

      await page.goto(`/${locale}/app/reviews`);
      await expect(page.getByRole("heading", { name: labels.reviewsHeading })).toBeVisible();
      await expect(page.getByText(labels.onDemandReview, { exact: true })).toBeVisible();

      await page.goto(`/${locale}/app/inbox?view=needs-you`);
      await expect(
        page.getByRole("navigation", { name: labels.navigation })
          .getByRole("link", { name: labels.primary[1], exact: true }),
      ).toHaveAttribute("aria-current", "page");

      await page.goto(`/${locale}/app/work?view=waiting`);
      await expect(
        page.getByRole("navigation", { name: labels.navigation })
          .getByRole("link", { name: labels.primary[2], exact: true }),
      ).toHaveAttribute("aria-current", "page");

      if (testInfo.project.name === "mobile") {
        const currentNavigation = page.getByRole("navigation", { name: labels.navigation });
        const summary = currentNavigation.locator("summary").filter({ hasText: labels.more });
        await summary.click();
        await summary.press("Escape");
        await expect(summary).toBeFocused();
        await expect(summary.locator("xpath=ancestor::details")).not.toHaveAttribute("open", "");
      }
    }

    await expect.poll(async () => {
      const response = await fetch(`${supabaseUrl}/rest/v1/product_events?select=event_name&user_id=eq.${userId}&is_synthetic=eq.false`, {
        headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}` },
      });
      expect(response.ok).toBe(true);
      const names = ((await response.json()) as Array<{ event_name: string }>).map((event) => event.event_name);
      return {
        needsAttentionViews: names.filter((name) => name === "needs_attention_viewed").length,
        workViews: names.filter((name) => name === "work_view_viewed").length,
      };
    }, { timeout: 20_000 }).toEqual({ needsAttentionViews: 2, workViews: 1 });
  });
});
