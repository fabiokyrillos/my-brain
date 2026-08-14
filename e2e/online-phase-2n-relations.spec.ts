import { expect, test, type Page } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2N.6's authenticated acceptance — the relations surface, proved
 * rendering against the hosted database.
 *
 * The unit tests prove the rules; this proves what a reader actually receives,
 * and it is the only place the accessibility tree, the layout and the RSC
 * boundary are real. Handoff §58's lesson is the reason it exists at all: two
 * surfaces have shipped green in this repository and **never rendered**.
 *
 * §63's lesson applies throughout: **absence is never asserted alone.** Every
 * `not.toContainText` is paired with a marker proving the page rendered — a
 * masked note, an undrawn node and a page that never loaded look identical to a
 * text assertion.
 *
 * ## Four disposable accounts, because four different states are being proved
 *
 * `owner` carries the full fixture; `stranger` carries **its own** relation, so
 * the cross-tenant control cannot pass on a blank page; `empty` carries nothing,
 * so the empty state is proved on an account that genuinely has none; and
 * `dense` carries fifty-one relationships, so the bound is measured rather than
 * asserted about a hypothetical.
 *
 * ## What the audit fixture proves, and what it does not
 *
 * `person_projects` and `person_contexts` have two writers, and the owner's
 * creation actions write an `audit_logs` row while the interpretation trigger
 * writes none. The harness plants that audit row with the **service-role key**
 * for one association and deliberately not for the others.
 *
 * **That proves the discriminator, not the trigger.** No fixture here creates an
 * `entry_entities` row, so nothing below should be read as evidence about what
 * the trigger does — the catalogue measured that against the migrations.
 *
 * No credential in source; all content synthetic; every account deleted at the
 * end, which cascades every row it owns.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

/** One marker per run, unique enough that a stray match is impossible. */
const MARK = "2n6b73e5";
const MARINA = `Marina Rel ${MARK}`;
const RAFAEL = `Rafael Rel ${MARK}`;
const ATLAS = `Atlas Rel ${MARK}`;
const TRABALHO = `Trabalho Rel ${MARK}`;
const ACME = `Acme Rel ${MARK}`;
const PRIVATE_NOTE = `anotacao reservada ${MARK}`;
const ROLE = `designer ${MARK}`;
const STRANGER_PERSON = `Estranha Rel ${MARK}`;

const COPY = {
  "pt-BR": {
    heading: "Relações",
    listHeading: "Todos os vínculos",
    diagramHeading: "Desenho",
    undrawnHeading: "Vínculos sem origem confirmada",
    ownerAuthored: "Informado por você",
    unattributable: "Não é possível dizer se você registrou este vínculo",
    layout: "não significam nada",
    figure: "Desenho das relações",
    reveal: /mostrar/i,
    emptyList: "Nenhum vínculo ainda",
    emptyDiagram: "Nada para desenhar",
    bounded: "Existem mais itens",
    manager: "Chefe",
    you: "Você",
    endRelationship: /encerrar relação/i,
  },
  en: {
    heading: "Relations",
    listHeading: "All links",
    diagramHeading: "Drawing",
    undrawnHeading: "Links with no confirmed origin",
    ownerAuthored: "Informed by you",
    unattributable: "The Brain cannot tell whether you recorded this link",
    layout: "mean nothing",
    figure: "Relations drawing",
    reveal: /show/i,
    emptyList: "No links yet",
    emptyDiagram: "Nothing to draw",
    bounded: "More items exist",
    manager: "Manager",
    you: "You",
    endRelationship: /end relationship/i,
  },
} as const;

test.describe("2N.6 — the relations surface draws only what it can explain", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const emails = {
    owner: `codex-2n6-${crypto.randomUUID()}@example.com`,
    stranger: `codex-2n6-stranger-${crypto.randomUUID()}@example.com`,
    empty: `codex-2n6-empty-${crypto.randomUUID()}@example.com`,
    dense: `codex-2n6-dense-${crypto.randomUUID()}@example.com`,
  };
  const ids: Record<keyof typeof emails, string | undefined> = {
    owner: undefined,
    stranger: undefined,
    empty: undefined,
    dense: undefined,
  };
  let marinaId: string | undefined;
  let atlasId: string | undefined;

  const rest = async (path: string, init: RequestInit = {}) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
        ...(init.headers ?? {}),
      },
    });

  async function insert<T>(table: string, rows: unknown): Promise<T[]> {
    // Every row of a bulk insert carries the SAME keys — PostgREST answers
    // `PGRST102 "All object keys must match"` otherwise.
    const response = await rest(table, { method: "POST", body: JSON.stringify(rows) });
    expect(response.ok, `${table} insert failed: ${await response.clone().text()}`).toBe(true);
    return (await response.json()) as T[];
  }

  async function createUser(address: string): Promise<string> {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: address, password: `Rel!${crypto.randomUUID()}A7`, email_confirm: true }),
    });
    expect(created.ok, `could not create ${address}: ${await created.clone().text()}`).toBe(true);
    return ((await created.json()) as { id: string }).id;
  }

  test.beforeAll(async () => {
    for (const key of Object.keys(emails) as (keyof typeof emails)[]) {
      ids[key] = await createUser(emails[key]);
    }
    const owner = ids.owner!;

    const [acme] = await insert<{ id: string }>("organizations", { user_id: owner, name: ACME });
    const people = await insert<{ id: string; name: string }>("people", [
      { user_id: owner, name: MARINA, notes: null, organization_id: acme.id },
      { user_id: owner, name: RAFAEL, notes: null, organization_id: null },
    ]);
    const byName = new Map(people.map((person) => [person.name, person.id]));
    marinaId = byName.get(MARINA);

    const [atlas] = await insert<{ id: string }>("projects", {
      user_id: owner,
      name: ATLAS,
      description: null,
      status: "active",
    });
    atlasId = atlas.id;
    const [trabalho] = await insert<{ id: string }>("contexts", {
      user_id: owner,
      name: TRABALHO,
      description: null,
      kind: "work",
    });

    // E1 — one writer, so owner-authored structurally. Its `description` is the
    // one governed string on the surface.
    await insert("person_relationships", {
      user_id: owner,
      person_id: marinaId,
      related_person_id: null,
      relationship_type: "manager",
      description: PRIVATE_NOTE,
      confidence: 1,
    });

    /*
     * E2/E3 — two writers, so the origin has to be proved.
     *
     * Marina↔Atlas gets an audit row and is DRAWN. Rafael↔Atlas and
     * Marina↔Trabalho get none and are LISTED ONLY. The pairing is the control:
     * without the audited one, "nothing is drawn" would pass for a surface that
     * simply never drew anything.
     */
    const [marinaAtlas] = await insert<{ id: string }>("person_projects", {
      user_id: owner,
      person_id: marinaId,
      project_id: atlasId,
      role: ROLE,
      confidence: 1,
    });
    await insert("person_projects", {
      user_id: owner,
      person_id: byName.get(RAFAEL),
      project_id: atlasId,
      role: null,
      confidence: 0.6,
    });
    await insert("person_contexts", {
      user_id: owner,
      person_id: marinaId,
      context_id: trabalho.id,
      confidence: 0.6,
    });
    await insert("audit_logs", {
      user_id: owner,
      action_type: "associate_person_project",
      entity_type: "person_project",
      entity_id: marinaAtlas.id,
      actor: "user",
      after_state: { person_id: marinaId, project_id: atlasId },
      reason: "fixture: owner associated a person with a project",
    });

    // The stranger's own relation, so the cross-tenant control is not vacuous.
    const [strangerPerson] = await insert<{ id: string }>("people", {
      user_id: ids.stranger,
      name: STRANGER_PERSON,
      notes: null,
    });
    await insert("person_relationships", {
      user_id: ids.stranger,
      person_id: strangerPerson.id,
      related_person_id: null,
      relationship_type: "friend",
      description: null,
      confidence: 1,
    });

    // Fifty-one relationships, one past `RELATION_LIMIT`, so the bound is
    // measured rather than assumed.
    const densePeople = await insert<{ id: string }>(
      "people",
      Array.from({ length: 51 }, (_, index) => ({
        user_id: ids.dense,
        name: `Denso ${String(index).padStart(2, "0")} ${MARK}`,
        notes: null,
      })),
    );
    await insert(
      "person_relationships",
      densePeople.map((person) => ({
        user_id: ids.dense,
        person_id: person.id,
        related_person_id: null,
        relationship_type: "colleague",
        description: null,
        confidence: 1,
      })),
    );
  });

  test.afterAll(async () => {
    for (const owner of Object.values(ids)) {
      if (!owner) continue;
      const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${owner}`, {
        method: "DELETE",
        headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
      });
      expect(deletion.ok, `could not remove ${owner}: ${await deletion.clone().text()}`).toBe(true);
    }
  });

  const signIn = (page: Page, who: keyof typeof emails, locale: "pt-BR" | "en") =>
    signInOnline(page, { email: emails[who], locale });

  for (const locale of ["pt-BR", "en"] as const) {
    const copy = COPY[locale];

    test(`the list carries every link and states each origin (${locale})`, async ({ page }) => {
      await signIn(page, "owner", locale);
      await page.goto(`/${locale}/app/relations`);

      // The fixture marker: the page rendered, so what follows means something.
      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();
      await expect(page.getByRole("heading", { name: copy.listHeading })).toBeVisible();

      const drawn = page.locator('[data-relation-group="drawn"]');
      const undrawn = page.locator('[data-relation-group="undrawn"]');

      // `2N-RELATION-002`/`-008` — owner-authored where it is true.
      await expect(drawn).toContainText(MARINA);
      await expect(drawn).toContainText(copy.manager);
      await expect(drawn).toContainText(copy.ownerAuthored);
      // `2N-RELATION-009` — the role the owner typed is preserved.
      await expect(drawn).toContainText(ROLE);
      // More than one node type reaches the page.
      await expect(drawn).toContainText(ATLAS);
      await expect(drawn).toContainText(ACME);

      // `2N-RELATION-006` — what cannot be attributed is listed, explained, and
      // NOT called owner-authored.
      await expect(page.getByRole("heading", { name: copy.undrawnHeading })).toBeVisible();
      await expect(undrawn).toContainText(copy.unattributable);
      await expect(undrawn).toContainText(RAFAEL);
      await expect(undrawn).toContainText(TRABALHO);
      await expect(undrawn).not.toContainText(copy.ownerAuthored);
    });

    test(`the drawing holds a subset, and says its layout means nothing (${locale})`, async ({ page }) => {
      await signIn(page, "owner", locale);
      await page.goto(`/${locale}/app/relations`);

      await expect(page.getByRole("heading", { name: copy.diagramHeading })).toBeVisible();
      await expect(page.locator("[data-layout-means-nothing]")).toContainText(copy.layout);

      const figure = page.getByRole("group", { name: copy.figure });
      await expect(figure).toBeVisible();
      // Drawn: the relationship and the audited association reach it.
      await expect(figure).toContainText(MARINA);
      await expect(figure).toContainText(ATLAS);
      await expect(figure).toContainText(copy.you);
      /*
       * NOT drawn, and this is the pair that carries the claim: Rafael reaches
       * the page only through an unattributable link, so he is in the list above
       * and absent from the figure. Asserted against a figure proved non-empty
       * by the three lines above, so it cannot pass on a picture that failed to
       * render.
       */
      await expect(figure).not.toContainText(RAFAEL);
      await expect(page.locator("body")).toContainText(RAFAEL);

      // The geometry layer carries no text and is hidden from assistive tech.
      const svg = figure.locator("svg");
      await expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(await svg.evaluate((node) => node.textContent ?? "")).toBe("");
      expect(await svg.locator("text, title, desc").count()).toBe(0);
      // Nothing on this page depends on hover.
      expect(await page.locator("[title]").count()).toBe(0);
    });

    test(`the owner's own sentence is withheld until it is asked for (${locale})`, async ({ page }) => {
      await signIn(page, "owner", locale);
      await page.goto(`/${locale}/app/relations`);

      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();
      // Rendered marker first, so "not visible" is a claim about masking rather
      // than about a page that never arrived.
      await expect(page.locator("body")).toContainText(MARINA);
      await expect(page.locator("body")).not.toContainText(PRIVATE_NOTE);

      // …and not through the accessibility tree or any attribute either.
      const inAttributes = await page.evaluate((needle) => {
        for (const element of Array.from(document.querySelectorAll("*"))) {
          for (const attribute of Array.from(element.attributes)) {
            if (attribute.value.includes(needle)) return `${element.tagName}.${attribute.name}`;
          }
        }
        return null;
      }, PRIVATE_NOTE);
      expect(inAttributes).toBeNull();

      await page.getByRole("button", { name: copy.reveal }).first().click();
      await expect(page.locator("body")).toContainText(PRIVATE_NOTE);
    });

    test(`the person page converges on the same posture for the same field (${locale})`, async ({ page }) => {
      await signIn(page, "owner", locale);
      await page.goto(`/${locale}/app/people/${marinaId}`);

      await expect(page.getByRole("heading", { level: 1 })).toContainText(MARINA);
      await expect(page.locator("body")).not.toContainText(PRIVATE_NOTE);
      await page.getByRole("button", { name: copy.reveal }).first().click();
      await expect(page.locator("body")).toContainText(PRIVATE_NOTE);
    });

    test(`a node opens the entity, where the writer actually lives (${locale})`, async ({ page }) => {
      await signIn(page, "owner", locale);
      await page.goto(`/${locale}/app/relations`);
      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();

      await page.getByRole("link", { name: new RegExp(MARINA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
        .first()
        .click();
      await page.waitForURL(new RegExp(`/${locale}/app/people/`));
      await expect(page.getByRole("heading", { level: 1 })).toContainText(MARINA);

      await page.goBack();
      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();
    });

    test(`the keyboard reaches a node in both presentations (${locale})`, async ({ page }) => {
      await signIn(page, "owner", locale);
      await page.goto(`/${locale}/app/relations`);
      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();

      const inList = page.locator('[data-relation-group="drawn"] a').first();
      await inList.focus();
      expect(await inList.evaluate((node) => node === document.activeElement)).toBe(true);

      const inFigure = page.getByRole("group", { name: copy.figure }).locator("a").first();
      await inFigure.focus();
      expect(await inFigure.evaluate((node) => node === document.activeElement)).toBe(true);

      await page.keyboard.press("Enter");
      await page.waitForURL(new RegExp(`/${locale}/app/(people|projects|contexts|organizations)/`));
    });

    test(`every control clears 44px and the page never scrolls sideways (${locale})`, async ({ page }) => {
      await signIn(page, "owner", locale);
      await page.goto(`/${locale}/app/relations`);
      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();

      const controls = page.locator(".relations-page a, .relations-page button");
      const count = await controls.count();
      expect(count, "no control was measured, so the minimum was not proved").toBeGreaterThan(3);
      for (let index = 0; index < count; index += 1) {
        const box = await controls.nth(index).boundingBox();
        if (!box) continue;
        expect(
          Math.max(box.height, box.width),
          `control ${index} is ${box.width}x${box.height}`,
        ).toBeGreaterThanOrEqual(44);
      }

      // The figure may scroll; the document may not.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "the page scrolls horizontally").toBeLessThanOrEqual(1);
    });

    test(`a stranger sees their own relations and never the owner's (${locale})`, async ({ page }) => {
      await signIn(page, "stranger", locale);
      await page.goto(`/${locale}/app/relations`);

      // Their own first, so "does not see the owner's" cannot pass on a blank page.
      await expect(page.locator("body")).toContainText(STRANGER_PERSON);
      for (const leak of [MARINA, RAFAEL, ATLAS, ACME, TRABALHO, PRIVATE_NOTE, ROLE]) {
        await expect(page.locator("body")).not.toContainText(leak);
      }
    });

    test(`an owner with nothing gets an honest emptiness on both presentations (${locale})`, async ({ page }) => {
      await signIn(page, "empty", locale);
      await page.goto(`/${locale}/app/relations`);

      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();
      await expect(page.locator("[data-relations-empty]")).toContainText(copy.emptyList);
      await expect(page.locator("[data-diagram-empty]")).toContainText(copy.emptyDiagram);
      // Nothing pretends to be a picture.
      expect(await page.locator(".relations-figure").count()).toBe(0);
    });

    test(`a bounded set says so once, above both presentations (${locale})`, async ({ page }) => {
      await signIn(page, "dense", locale);
      await page.goto(`/${locale}/app/relations`);

      await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();
      const notice = page.locator("[data-bounded]");
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(copy.bounded);
      // One bound, stated once — not one per presentation.
      expect(await notice.count()).toBe(1);
    });
  }

  /*
   * The removal journey runs once, in pt-BR on whichever project reaches it, and
   * plants **its own** row so it is idempotent: ending a shared fixture would
   * make the second run of this file fail against a relation the first had
   * already ended.
   */
  test("ending a relation removes it from both presentations", async ({ page }) => {
    const copy = COPY["pt-BR"];
    const marker = `Temporaria ${crypto.randomUUID().slice(0, 8)} ${MARK}`;
    const [person] = await insert<{ id: string }>("people", {
      user_id: ids.owner,
      name: marker,
      notes: null,
    });
    await insert("person_relationships", {
      user_id: ids.owner,
      person_id: person.id,
      related_person_id: null,
      relationship_type: "mentor",
      description: null,
      confidence: 1,
    });

    await signIn(page, "owner", "pt-BR");
    await page.goto("/pt-BR/app/relations");
    await expect(page.locator("body")).toContainText(marker);

    // Ended through the product's OWN authority path, not through the harness:
    // `2N-RELATION-004` requires an existing path, and the relations surface
    // deliberately owns no writer.
    await page.goto(`/pt-BR/app/people/${person.id}`);
    await page.getByRole("button", { name: copy.endRelationship }).first().click();
    await expect(page.locator("body")).not.toContainText("Mentora/Mentor");

    await page.goto("/pt-BR/app/relations");
    await expect(page.getByRole("heading", { level: 1, name: copy.heading })).toBeVisible();
    // The person survives — ending is not deleting — and the LINK is gone from
    // both presentations. Asserted against a page proved to have rendered.
    await expect(page.locator("body")).toContainText(MARINA);
    await expect(page.locator("body")).not.toContainText(marker);
  });
});
