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
            primary: ["Início", "Registros", "Trabalho", "Brain"],
            // The three destinations the five-slot mobile bar carries beside
            // capture and Mais (UX-14, DEC-1).
            mobileBar: ["Início", "Trabalho", "Brain"],
            mobileDemoted: "Registros",
            capture: "Captura rápida",
            more: "Mais",
            groups: ["Contexto", "Reflexão", "Organização", "Transparência", "Preferências"],
            notification: "Notificações",
            switchLanguage: "Mudar idioma para inglês",
            allSaved: "Nada pendente. Tudo salvo.",
            attentionSection: "Precisa de você",
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
            primary: ["Home", "Records", "Work", "Brain"],
            mobileBar: ["Home", "Work", "Brain"],
            mobileDemoted: "Records",
            capture: "Quick capture",
            more: "More",
            groups: ["Context", "Reflection", "Organization", "Transparency", "Preferences"],
            notification: "Notifications",
            switchLanguage: "Switch language to Portuguese",
            allSaved: "Nothing pending. Everything is saved.",
            attentionSection: "Needs you",
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
      /*
       * Home's own markup, as Slice C rebuilt it.
       *
       * These two assertions addressed the pre-Slice-C panel grid — the exact
       * string "Tudo salvo" and a `.attention-panel` article — neither of which
       * exists since Home became an attention surface. The spec was left asserting
       * a page that had been replaced, and failed identically on `main` before this
       * slice touched it. Repaired here because B2's acceptance requires this
       * journey green, not because B2 changed Home.
       */
      await expect(page.getByRole("status").filter({ hasText: labels.allSaved })).toBeVisible();
      const attentionSection = page.getByRole("region", { name: labels.attentionSection });
      await attentionSection.scrollIntoViewIfNeeded();
      await expect(attentionSection).toBeVisible();
      const navigation = page.getByRole("navigation", { name: labels.navigation });
      await expect(navigation).toBeVisible();

      if (testInfo.project.name === "mobile") {
        /*
         * The bar carries three destinations plus capture and Mais (UX-14, DEC-1).
         *
         * Registros is deliberately *not* on it: five slots with capture in the
         * middle is what makes the button exactly centred, and Registros is an
         * archive rather than an operational queue. It must therefore be hidden
         * before the disclosure opens and present the moment it does — asserted in
         * both directions, because "reachable" is the whole claim.
         */
        for (const destination of labels.mobileBar) {
          await expect(navigation.getByRole("link", { name: destination, exact: true })).toBeVisible();
        }
        await expect(navigation.getByRole("link", { name: labels.capture, exact: true })).toBeVisible();
        await expect(
          navigation.getByRole("link", { name: labels.mobileDemoted, exact: true }),
        ).toBeHidden();

        await navigation.getByText(labels.more, { exact: true }).click();
        await expect(
          navigation.getByRole("link", { name: labels.mobileDemoted, exact: true }),
        ).toBeVisible();
      } else {
        const primary = navigation.getByRole("group", { name: labels.primaryGroup });
        for (const destination of labels.primary) {
          await expect(primary.getByRole("link", { name: destination, exact: true })).toBeVisible();
        }
        // Slice B moved the rail's five secondary groups behind their own
        // disclosure, so on desktop they are hidden until it is opened — exactly as
        // on mobile. This branch never opened it, and the assertion below was
        // unreachable behind an earlier stale expectation rather than passing.
        await navigation.getByLabel(labels.more, { exact: true }).click();
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
        // Scoped by label, not by tag: since Slice D3 the overflow panel contains a
        // second disclosure — the account surface — so a bare `summary` locator is
        // a strict-mode violation rather than "the More button".
        const moreTarget = await navigation.getByLabel(labels.more, { exact: true }).boundingBox();
        expect(touchTargets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
        expect(moreTarget?.width).toBeGreaterThanOrEqual(44);
        expect(moreTarget?.height).toBeGreaterThanOrEqual(44);

        // The account disclosure lives in this panel too, and is a touch target
        // like any other.
        const accountTarget = await navigation.locator(".account-menu > summary").boundingBox();
        expect(accountTarget?.width).toBeGreaterThanOrEqual(44);
        expect(accountTarget?.height).toBeGreaterThanOrEqual(44);
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
      {
        /*
         * Registros is a rail destination on desktop and a `Mais` destination on
         * mobile (UX-14, DEC-1), so "is it marked current" is asked differently on
         * each surface — and on mobile the link is not exposed at all until the
         * disclosure opens, which is the behaviour rather than a defect.
         */
        const currentNav = page.getByRole("navigation", { name: labels.navigation });
        if (testInfo.project.name === "mobile") {
          await currentNav.getByLabel(labels.more, { exact: true }).click();
        }
        await expect(
          currentNav.getByRole("link", { name: labels.primary[1], exact: true }),
        ).toHaveAttribute("aria-current", "page");
      }

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

        /*
         * Standing inside a demoted destination (UX-14, DEC-1).
         *
         * The failure this prevents: a phone user reading Registros sees no active
         * state anywhere, because the destination they are in was moved off the bar.
         * `Mais` must carry it instead.
         */
        await page.goto(`/${locale}/app/inbox`);
        const insideRegistros = page.getByRole("navigation", { name: labels.navigation });
        const registrosSummary = insideRegistros.locator("summary").filter({ hasText: labels.more });
        await expect(registrosSummary.locator("xpath=ancestor::details")).toHaveClass(/active/);

        // And opening it from `Mais` closes the disclosure rather than leaving the
        // panel over the page the user just asked for.
        await page.goto(`/${locale}/app`);
        const fresh = page.getByRole("navigation", { name: labels.navigation });
        const freshSummary = fresh.locator("summary").filter({ hasText: labels.more });
        await freshSummary.click();
        const demotedLink = fresh.getByRole("link", { name: labels.mobileDemoted, exact: true });
        await expect(demotedLink).toBeVisible();
        await demotedLink.click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/app/inbox$`));
        await expect(freshSummary.locator("xpath=ancestor::details")).not.toHaveAttribute("open", "");

        // Labels must not overflow their column at either supported width. The bar
        // is five equal columns, so a label wider than its slot would clip.
        const overflowing = await fresh.evaluate((nav) => {
          const slots = [...nav.children].filter((child) => !child.classList.contains("capture-fab"));
          return slots
            .map((slot) => ({
              text: (slot.querySelector("summary") ?? slot).textContent?.trim() ?? "",
              overflows: slot.scrollWidth > slot.clientWidth + 1,
            }))
            .filter((slot) => slot.overflows);
        });
        expect(overflowing, "a mobile navigation label overflows its slot").toEqual([]);
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
