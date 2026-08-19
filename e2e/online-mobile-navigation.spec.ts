import { expect, test } from "@playwright/test";

import { mintOnlineAccessToken, signInOnline } from "./support/online-session";

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

    // `signInWithPassword` is refused by hosted CAPTCHA (`400 captcha_failed`)
    // for every client, so the user token comes from the admin link exchange.
    accessToken = (await mintOnlineAccessToken({
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
    })).accessToken;
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
    await signInOnline(page, { email, locale: "pt-BR" });

    for (const locale of ["pt-BR", "en"] as const) {
      const labels = locale === "pt-BR"
        ? {
            navigation: testInfo.project.name === "mobile" ? "Navegação móvel" : "Navegação principal",
            primaryGroup: "Principal",
            /*
              Corrected rather than retargeted: this list claimed "Início" and
              "Conversar" where the product renders "Hoje" and "Brain", and the
              lane failed on the baseline for that reason before slice 2P.5
              touched anything. Measured by running it against a stashed tree.
            */
            primary: ["Hoje", "Registros", "Trabalho", "Brain"],
            // The four destinations the five-slot mobile bar carries beside
            // capture (UX-14, DEC-1). `Mais` retired in slice 2P.5, so the bar
            // and the primary list are now the same four.
            mobileBar: ["Hoje", "Registros", "Trabalho", "Brain"],
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
            primary: ["Today", "Records", "Work", "Brain"],
            mobileBar: ["Today", "Records", "Work", "Brain"],
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
         * The bar carries four destinations plus capture — the bar
         * `02-arquitetura-e-rotas.md` specifies, delivered by slice 2P.5.
         *
         * `Mais` retired when the two destinations that needed it got paths of
         * their own: the account reached the top bar, and Perguntas got an
         * unconditional link in Registros' header. So there is no disclosure to
         * open, and the assertion is that there is none — with the five visible
         * slots as the control, because an absence over an empty nav is free.
         */
        for (const destination of labels.mobileBar) {
          await expect(navigation.getByRole("link", { name: destination, exact: true })).toBeVisible();
        }
        await expect(navigation.getByRole("link", { name: labels.capture, exact: true })).toBeVisible();
        await expect(navigation.locator(":scope > a")).toHaveCount(5);
        await expect(navigation.locator(":scope > details")).toHaveCount(0);
        await expect(navigation.getByText(labels.more, { exact: true })).toHaveCount(0);

        // …and the account is in the header instead, reachable without opening
        // anything: that move is what freed the slot.
        await expect(page.locator(".top-account .account-menu-header")).toBeVisible();
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

        /*
          The grouped index, on the surface that still has one.

          Slice 2P.5 retired the mobile disclosure, so these ten destinations are
          reached on a phone from Brain, Trabalho, Registros, the calendar, the
          account and the palette instead. `mobile-reachability-guard` re-derives
          every one of those paths from the component that emits it, which is the
          honest place for a claim no single navigation can answer.
        */
        for (const group of labels.groups) {
          await expect(navigation.getByRole("group", { name: group })).toBeVisible();
        }
        for (const [name, route] of labels.secondary) {
          await expect(navigation.getByRole("link", { name, exact: true })).toHaveAttribute(
            "href",
            `/${locale}/app/${route}`,
          );
        }
      }

      if (testInfo.project.name === "mobile") {
        const touchTargets = await navigation.getByRole("link").evaluateAll((links) => (
          links
            .map((link) => link.getBoundingClientRect())
            .filter((box) => box.width > 0 && box.height > 0)
            .map((box) => ({ width: box.width, height: box.height }))
        ));
        expect(touchTargets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);

        // The account disclosure moved to the header in slice 2P.5, and is a
        // touch target there like any other.
        const accountTarget = await page.locator(".top-account .account-menu-header > summary").boundingBox();
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

      /*
        The retired preferences must be offered by NO section, so the absence is
        checked on every one of them rather than on the page they used to share.
        The advanced routing disclosure is the IA section.
      */
      for (const section of ["", "/assistant", "/ai", "/planning", "/privacy", "/appearance", "/account"]) {
        await page.goto(`/${locale}/app/settings${section}`);
        for (const hiddenSetting of labels.hiddenSettings) {
          await expect(page.getByLabel(hiddenSetting, { exact: true })).toHaveCount(0);
        }
      }
      await page.goto(`/${locale}/app/settings/ai`);
      const advancedSummary = page.locator("summary").filter({ hasText: labels.advanced });
      const advancedBox = await advancedSummary.boundingBox();
      expect(advancedBox?.width).toBeGreaterThanOrEqual(44);
      expect(advancedBox?.height).toBeGreaterThanOrEqual(44);
      await advancedSummary.click();
      await expect(page.getByRole("link", { name: labels.costsLink })).toHaveAttribute("href", `/${locale}/app/costs`);

      await page.goto(`/${locale}/app/reviews`);
      await expect(page.getByRole("heading", { name: labels.reviewsHeading, exact: true })).toBeVisible();
      await expect(page.getByText(labels.onDemandReview, { exact: true })).toBeVisible();

      await page.goto(`/${locale}/app/inbox?view=needs-you`);
      {
        /*
         * Registros is a bar slot on both surfaces since slice 2P.5, so the same
         * question is asked the same way on each: the slot itself carries
         * `aria-current`. On mobile it used to require opening `Mais` first,
         * because the destination was demoted off the bar.
         */
        const currentNav = page.getByRole("navigation", { name: labels.navigation });
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
        /*
         * Escape and focus-restore, on the disclosure a phone actually has.
         *
         * It used to be the bar's `Mais`; slice 2P.5 retired that and put the
         * account in the header, so the behaviour moved with the control rather
         * than being dropped along with the panel.
         */
        const accountSummary = page.locator(".top-account .account-menu-header > summary");
        await accountSummary.click();
        await accountSummary.press("Escape");
        await expect(accountSummary).toBeFocused();
        await expect(accountSummary.locator("xpath=ancestor::details")).not.toHaveAttribute("open", "");

        /*
         * Standing inside Registros (UX-14, DEC-1).
         *
         * The failure this prevents is unchanged — a phone user reading a
         * destination sees no active state anywhere — and the answer got simpler:
         * the destination is a slot, so the slot says it.
         */
        await page.goto(`/${locale}/app/inbox`);
        const insideRegistros = page.getByRole("navigation", { name: labels.navigation });
        await expect(
          insideRegistros.getByRole("link", { name: labels.primary[1], exact: true }),
        ).toHaveAttribute("aria-current", "page");

        // And following it from the bar lands on the destination, with no panel
        // left open over the page the user just asked for.
        await page.goto(`/${locale}/app`);
        const fresh = page.getByRole("navigation", { name: labels.navigation });
        await fresh.getByRole("link", { name: labels.primary[1], exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/app/inbox$`));

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
