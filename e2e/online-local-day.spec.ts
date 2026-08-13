import { expect, test, type Cookie, type Page } from "@playwright/test";

import { onlineEnvironment, signInWithoutTheLoginForm, type OnlineLocale } from "./support/online-session";

/**
 * `LDC-JOURNEY-001` — the initiative's claim, in a real browser, against the
 * hosted project.
 *
 * ## What was and was not proved before this file
 *
 * Units 1–4b repaired thirty-one occurrences and proved it three ways: a
 * tree-wide guard at zero in four families, a convergence test, and 6536 unit
 * tests. Every one of those is **structural**. None of them renders a page.
 *
 * `docs/reports/local-day-correction/` recorded that gap in the plainest terms
 * available — *"not proven anywhere yet: that any of this renders correctly in a
 * real browser, or against production"* — and this file is the answer to it.
 *
 * ## Why two accounts and not one
 *
 * A single account cannot distinguish "renders the owner's day" from "renders
 * some day". Two accounts can, and this file runs the **same instant** past two
 * owners whose zones are on **different calendar dates** at that instant:
 *
 * | owner | zone | seeded instant | owner sees | UTC/host would show |
 * | --- | --- | --- | --- | --- |
 * | ahead | `Pacific/Auckland` | `2026-05-14T23:00Z` | **15 May** | 14 May |
 * | behind | `America/Los_Angeles` | `2026-05-14T03:00Z` | **13 May** | 14 May |
 *
 * Each owner's instant is chosen so their civil date differs from UTC's **in the
 * opposite direction**, so a surface pinned to UTC fails for both, and a surface
 * that merely picked "some other zone" fails for at least one. Before this
 * initiative every row in the `owner sees` column read `14 May`.
 *
 * **May, deliberately.** Today is in August; a fixture dated today would let a
 * page's own "today" satisfy an assertion about a stored instant. Nothing here
 * shares a month with the present.
 *
 * The two owners also take **different locales**, so the pt-BR and en renderings
 * of the same contract are both exercised.
 *
 * ## What is a fixture and what is a claim
 *
 * The service role seeds rows the product would otherwise create through capture
 * and interpretation — a provider call this initiative neither authorizes nor
 * needs in order to test a *rendering*. Every claim is read off a page the
 * product rendered. Each seeded instant is **read back and asserted** before any
 * surface is visited, because a trigger silently rewriting `updated_at` would
 * otherwise surface as a confusing product failure rather than a broken fixture.
 *
 * Both accounts are deleted in `afterAll`, and `npm run verify:online-residue`
 * is the independent check that they were.
 */

const { supabaseUrl, serviceRoleKey } = onlineEnvironment;
const onlineConfigured = onlineEnvironment.configured;

/** The contract's own presentations, mirrored so expectations are exact. */
const OPTIONS = {
  day: { dateStyle: "medium" },
  dayAndTime: { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

function render(
  presentation: keyof typeof OPTIONS,
  locale: string,
  timeZone: string,
  instant: string,
): string {
  return new Intl.DateTimeFormat(locale, { ...OPTIONS[presentation], timeZone }).format(new Date(instant));
}

/**
 * Every way this product spells one calendar day.
 *
 * The first version of this file asserted a single presentation — the contract's
 * `day`, `dateStyle: "medium"` — and the calendar failed it while being
 * completely correct: `calendar-view.tsx` labels a column
 * `{ weekday: "short", day: "2-digit", month: "short" }`, so "Wed, May 13" is
 * the right day in the wrong format for the assertion. **A test that pins a
 * format is testing the format**, and would have gone on failing every time a
 * surface chose a different one.
 *
 * So a day is checked as a *set*: the owner's day must appear in at least one of
 * these spellings, and the UTC day in none of them. Each bag below is one an
 * actual surface uses.
 */
const DAY_SPELLINGS: readonly Intl.DateTimeFormatOptions[] = [
  { dateStyle: "medium" }, // the contract's `day`/`dayAndTime`
  { dateStyle: "long" },
  { dateStyle: "full" },
  { weekday: "short", day: "2-digit", month: "short" }, // calendar-view column label
  { weekday: "long", day: "numeric", month: "long" }, // the Home header
  { day: "numeric", month: "long" },
];

function daySpellings(locale: string, timeZone: string, instant: string): string[] {
  const at = new Date(instant);
  return DAY_SPELLINGS.map((options) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(at),
  );
}

/** `YYYY-MM-DD` in a named zone. Never the runner's. */
function civilDateIn(timeZone: string, instant: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

interface OwnerProfile {
  readonly key: string;
  readonly zone: string;
  readonly locale: OnlineLocale;
  /** An instant whose civil date in `zone` differs from UTC's. */
  readonly boundary: string;
  /** The civil date the owner must see for `boundary`. */
  readonly ownerDay: string;
  /** The civil date UTC — and therefore the old code — would have shown. */
  readonly utcDay: string;
  /** Two instants six months apart, for the hemisphere's DST pair. */
  readonly dst: { readonly hemisphere: "northern" | "southern"; readonly a: string; readonly b: string };
}

const OWNERS: readonly OwnerProfile[] = [
  {
    key: "ahead",
    zone: "Pacific/Auckland",
    locale: "pt-BR",
    boundary: "2026-05-14T23:00:00.000Z",
    ownerDay: "2026-05-15",
    utcDay: "2026-05-14",
    // NZDT (+13) in January, NZST (+12) in July: the same UTC clock renders an
    // hour apart. Southern hemisphere, so the offsets move the opposite way to
    // New York's.
    dst: { hemisphere: "southern", a: "2026-01-15T09:00:00.000Z", b: "2026-07-15T09:00:00.000Z" },
  },
  {
    key: "behind",
    zone: "America/Los_Angeles",
    locale: "en",
    boundary: "2026-05-14T03:00:00.000Z",
    ownerDay: "2026-05-13",
    utcDay: "2026-05-14",
    // PST (−8) in January, PDT (−7) in July.
    dst: { hemisphere: "northern", a: "2026-01-15T17:00:00.000Z", b: "2026-07-15T17:00:00.000Z" },
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
  const text = await response.text();
  return (text ? JSON.parse(text) : []) as Record<string, unknown>[];
}

async function createAccount(prefix: string) {
  const email = `codex-${prefix}-${crypto.randomUUID()}@example.com`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, email_confirm: true }),
  });
  expect(response.ok, await response.clone().text()).toBe(true);
  const { id } = (await response.json()) as { id: string };
  return { email, id };
}

async function deleteAccount(userId: string | undefined) {
  if (!userId) return;
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
  });
}

/** Everything one owner's journey needs, seeded and verified. */
interface Fixture {
  readonly userId: string;
  readonly email: string;
  readonly entryId: string;
  readonly personId: string;
  readonly projectId: string;
  readonly memoryId: string;
  readonly conversationId: string;
  readonly taskId: string;
  readonly dstEntries: { readonly a: string; readonly b: string };
}

/**
 * The fixture's own words, per surface.
 *
 * Every surface assertion is an **absence** — "the UTC day appears nowhere" —
 * and an absence is satisfied by a page that rendered nothing at all. A route
 * still showing its Suspense fallback, a query that returned no rows, a page
 * that 404'd: each of them passes an absence assertion while proving nothing.
 *
 * So each surface also names a string that must be on the page, taken from what
 * this file seeded. If the marker is missing the surface never rendered the
 * fixture, and the test fails as a fixture defect instead of passing as a
 * product success.
 */
function markers(owner: OwnerProfile) {
  return {
    entry: `Reunião de fronteira ${owner.key}`,
    memory: `Memória de fronteira ${owner.key}`,
    person: `Pessoa ${owner.key}`,
    project: `Projeto ${owner.key}`,
    conversation: `Conversa ${owner.key}`,
    question: `Pergunta de fronteira ${owner.key}`,
    task: `Tarefa de fronteira ${owner.key}`,
    file: `fronteira-${owner.key}.txt`,
  };
}

/**
 * Seeds one owner, reporting the account id **before** anything can fail.
 *
 * `afterAll` used to delete `fixture?.userId`, which is `undefined` whenever
 * seeding threw — so the run that most needed cleaning up, the failed one, was
 * exactly the one that leaked. Observed rather than reasoned about: a fixture
 * defect in this file's first execution left two accounts on the hosted project.
 *
 * `record` is called the instant the account exists, so the caller can delete it
 * whatever happens afterwards. It is a per-owner callback rather than a shared
 * set on purpose: both `describe` blocks can land in one worker, and a shared
 * set would let the first `afterAll` delete the second owner's live account.
 */
async function seed(owner: OwnerProfile, record: (userId: string) => void): Promise<Fixture> {
  const account = await createAccount(`local-day-${owner.key}`);
  record(account.id);

  /*
   * The zone is *set* here rather than read, which is the opposite of what
   * `online-day-review.spec.ts` does and is correct for a different reason: that
   * journey asks "what does the product think the owner's day is", so it must
   * not tell it. This one asks "does the product use the owner's zone at all",
   * which is unanswerable unless the zone is known and is neither the host's nor
   * UTC. Read back below, so a refused update fails as a fixture.
   */
  await admin(`profiles?user_id=eq.${account.id}`, {
    method: "PATCH",
    body: JSON.stringify({ timezone: owner.zone, locale: owner.locale }),
  });
  const [profile] = await admin(`profiles?user_id=eq.${account.id}&select=timezone,locale`);
  expect(profile?.timezone, "the profile did not take the fixture's zone").toBe(owner.zone);
  expect(profile?.locale, "the profile did not take the fixture's locale").toBe(owner.locale);

  const [entry] = await admin("entries", {
    method: "POST",
    body: JSON.stringify({
      user_id: account.id,
      original_content: `Reunião de fronteira ${owner.key}`,
      occurred_at: owner.boundary,
      status: "completed",
      locale: owner.locale,
    }),
  });

  // The interpretation exists so the entity links below have one to point at;
  // its content is never asserted.
  const [interpretation] = await admin("entry_interpretations", {
    method: "POST",
    body: JSON.stringify({
      user_id: account.id,
      entry_id: entry.id,
      confidence: 0.9,
      model: "fixture",
      prompt_version: "fixture",
      strategy_version: "fixture",
      summary: `Fixture para ${owner.key}`,
      raw_output: {},
      // Set explicitly rather than left to their defaults: the question preview
      // parses this row through a Zod schema and `loadQuestionPreviews` is
      // wrapped in `.catch(() => new Map())`, so a shape it rejects produces no
      // preview and no error — a surface that renders nothing while looking
      // like it rendered fine.
      version: 1,
      extracted_people: [],
      extracted_projects: [],
      extracted_organizations: [],
      extracted_contexts: [],
      task_candidates: [],
      pending_questions: [],
    }),
  });

  // The entry detail renders through its *current* interpretation, so the link
  // has to exist or the page has nothing to show and the assertion below would
  // pass on an empty surface.
  await admin(`entries?id=eq.${entry.id}`, {
    method: "PATCH",
    body: JSON.stringify({ current_interpretation_id: interpretation.id }),
  });

  const [person] = await admin("people", {
    method: "POST",
    body: JSON.stringify({ user_id: account.id, name: `Pessoa ${owner.key}` }),
  });
  const [project] = await admin("projects", {
    method: "POST",
    body: JSON.stringify({ user_id: account.id, name: `Projeto ${owner.key}` }),
  });

  for (const [type, id] of [["person", person.id], ["project", project.id]] as const) {
    await admin("entry_entities", {
      method: "POST",
      body: JSON.stringify({
        user_id: account.id,
        entry_id: entry.id,
        interpretation_id: interpretation.id,
        entity_type: type,
        entity_id: id,
        mention: `Menção ${owner.key}`,
        confidence: 0.9,
      }),
    });
  }

  const [memory] = await admin("memories", {
    method: "POST",
    body: JSON.stringify({
      user_id: account.id,
      content: `Memória de fronteira ${owner.key}`,
      source_entry_id: entry.id,
      valid_from: owner.boundary,
    }),
  });

  const [conversation] = await admin("conversations", {
    method: "POST",
    body: JSON.stringify({
      user_id: account.id,
      title: `Conversa ${owner.key}`,
      locale: owner.locale,
      updated_at: owner.boundary,
    }),
  });

  await admin("pending_questions", {
    method: "POST",
    body: JSON.stringify({
      user_id: account.id,
      entry_id: entry.id,
      interpretation_id: interpretation.id,
      candidate_index: 0,
      confidence: 0.5,
      question: `Pergunta de fronteira ${owner.key}?`,
      reason: "fixture",
      created_at: owner.boundary,
    }),
  });

  const [task] = await admin("tasks", {
    method: "POST",
    body: JSON.stringify({
      user_id: account.id,
      title: `${markers(owner).task}`,
      status: "todo",
      // `due_at` is what Work renders; `planned_at` is what the calendar places.
      due_at: owner.boundary,
      planned_at: owner.boundary,
    }),
  });

  /*
   * The files page renders exactly one instant — a failing job's next retry —
   * so proving it needs a failing job rather than merely an attachment. Seeded
   * as `failed` with the boundary as its retry time; nothing drains it, and the
   * account is deleted at the end of the run.
   */
  const [attachment] = await admin("attachments", {
    method: "POST",
    body: JSON.stringify({
      user_id: account.id,
      original_name: markers(owner).file,
      mime_type: "text/plain",
      size_bytes: 12,
      storage_path: `${account.id}/fronteira-${owner.key}.txt`,
      status: "failed",
    }),
  });
  await admin("jobs", {
    method: "POST",
    body: JSON.stringify({
      user_id: account.id,
      type: "process_attachment",
      status: "failed",
      idempotency_key: `local-day-${owner.key}-${account.id}`,
      payload: { attachmentId: attachment.id },
      attempts: 1,
      next_attempt_at: owner.boundary,
    }),
  });

  // The DST pair: two entries six months apart at the same UTC clock time, so
  // the only thing that can move their rendered times is the zone's offset.
  const dstEntries: string[] = [];
  for (const instant of [owner.dst.a, owner.dst.b] as const) {
    const [row] = await admin("entries", {
      method: "POST",
      body: JSON.stringify({
        user_id: account.id,
        original_content: `DST ${owner.key} ${instant}`,
        occurred_at: instant,
        status: "completed",
        locale: owner.locale,
      }),
    });
    dstEntries.push(row.id as string);
  }

  /*
   * The fixture, verified before a single page is opened. A trigger that reset
   * `updated_at` on insert — which `conversations` plausibly has — would
   * otherwise show up as a *product* failure three surfaces later.
   */
  const [storedEntry] = await admin(`entries?id=eq.${entry.id}&select=occurred_at`);
  expect(new Date(storedEntry.occurred_at as string).toISOString(), "the entry did not keep its instant")
    .toBe(owner.boundary);
  const [storedMemory] = await admin(`memories?id=eq.${memory.id}&select=valid_from`);
  expect(new Date(storedMemory.valid_from as string).toISOString(), "the memory did not keep its instant")
    .toBe(owner.boundary);
  const [storedConversation] = await admin(`conversations?id=eq.${conversation.id}&select=updated_at`);
  expect(
    new Date(storedConversation.updated_at as string).toISOString(),
    "the conversation did not keep its instant — a trigger rewrote updated_at, so this fixture cannot test what it claims",
  ).toBe(owner.boundary);

  return {
    userId: account.id,
    email: account.email,
    entryId: entry.id as string,
    personId: person.id as string,
    projectId: project.id as string,
    memoryId: memory.id as string,
    conversationId: conversation.id as string,
    taskId: task.id as string,
    dstEntries: { a: dstEntries[0], b: dstEntries[1] },
  };
}

/**
 * The whole page's text, which is what an absence assertion has to read.
 *
 * Scoping to a testid would be tighter, but the claim being made is exactly a
 * whole-page one: **the wrong day must appear nowhere**. A surface that renders
 * the owner's day in the heading and UTC's in a tooltip is still broken, and a
 * scoped assertion would call it fixed.
 */
/**
 * The page, once it is actually a page.
 *
 * `src/app/[locale]/app/loading.tsx` renders a `role="status"` fallback while a
 * route streams, and reading through it is how an absence assertion passes
 * without ever seeing the surface. This was not hypothetical: the first hosted
 * run of this file failed the Home header case with a body containing nothing
 * but the navigation shell and "Carregando página" — and the eleven surface
 * cases that had already "passed" were one slow response away from proving
 * nothing at all.
 *
 * (That fallback's label is pt-BR in both locales — a real i18n gap, unrelated
 * to this initiative, recorded rather than fixed here.)
 */
async function settle(page: Page): Promise<string> {
  await expect(
    page.getByRole("status", { name: "Carregando página" }),
    "the route never finished streaming",
  ).toHaveCount(0, { timeout: 60_000 });
  const text = await pageText(page);
  expect(text.length, "the page rendered no text at all").toBeGreaterThan(120);
  return text;
}

async function pageText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/ /g, " ");
}

for (const owner of OWNERS) {
  test.describe(`the owner's local day reaches every surface — ${owner.key} (${owner.zone}, ${owner.locale})`, () => {
    test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

    let fixture: Fixture;
    /** This owner's accounts, recorded before seeding can fail. */
    const accounts: string[] = [];
    /**
     * One session per owner, reused by every case below.
     *
     * Each case used to sign in for itself, which is what every other online
     * spec does — and at this file's size that is roughly thirty magiclink
     * exchanges in two minutes. GoTrue answered `429 over_request_rate_limit`
     * and eight unrelated cases failed with it, which reads as eight product
     * defects and is none. The session is minted once, in `beforeAll`, and its
     * cookie is installed into each case's fresh context.
     *
     * The consent interposition is walked through once, there, for the same
     * reason and by the same product surface.
     */
    let sessionCookies: Cookie[] = [];

    test.beforeAll(async ({ browser }) => {
      fixture = await seed(owner, (userId) => accounts.push(userId));

      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await signInWithoutTheLoginForm(page, {
          supabaseUrl: onlineEnvironment.supabaseUrl!,
          serviceRoleKey: onlineEnvironment.serviceRoleKey!,
          publishableKey: onlineEnvironment.publishableKey!,
          email: fixture.email,
          locale: owner.locale,
          appOrigin: test.info().project.use.baseURL!,
          next: `/${owner.locale}/app`,
        });
        sessionCookies = await context.cookies();
      } finally {
        await context.close();
      }
    });

    /** The signed-in browser for one case, without a fresh GoTrue exchange. */
    async function visit(page: Page, path: string): Promise<void> {
      await page.context().addCookies(sessionCookies);
      await page.goto(`/${owner.locale}${path}`);
    }

    test.afterAll(async () => {
      // Drained, so a retried `beforeAll` that created a second account does not
      // leave the first one behind.
      while (accounts.length > 0) await deleteAccount(accounts.pop());
    });

    test("the premise holds: this instant is a different day in the owner's zone than in UTC", () => {
      expect(civilDateIn(owner.zone, owner.boundary)).toBe(owner.ownerDay);
      expect(civilDateIn("UTC", owner.boundary)).toBe(owner.utcDay);
      expect(owner.ownerDay, "the fixture cannot distinguish the owner's zone from UTC").not.toBe(owner.utcDay);
    });

    /**
     * The surfaces, each with the fixture text that proves it actually rendered.
     *
     * `marker` is what makes the assertion below a control rather than a
     * formality: without it, every case is satisfied by a blank page.
     * `arrive` is for the two surfaces that need more than a URL — the calendar
     * has to be anchored at the owner's day, and search has to be asked a
     * question before it shows anything.
     */
    const M = markers(owner);
    const SURFACES: readonly {
      readonly name: string;
      readonly path: (f: Fixture) => string;
      readonly marker: string;
      readonly arrive?: (page: Page, f: Fixture) => Promise<void>;
    }[] = [
      { name: "entry detail", path: (f) => `/app/inbox/${f.entryId}`, marker: M.entry },
      { name: "memory detail", path: (f) => `/app/memories/${f.memoryId}`, marker: M.memory },
      { name: "person page", path: (f) => `/app/people/${f.personId}`, marker: M.person },
      { name: "project page", path: (f) => `/app/projects/${f.projectId}`, marker: M.project },
      { name: "conversations", path: () => "/app/chat", marker: M.conversation },
      {
        name: "question panels",
        path: () => "/app/questions",
        marker: M.question,
        /*
         * The panels are `<details>`, collapsed by default, and `innerText`
         * does not report collapsed content — so the first version of this case
         * read a page whose dates were present in the DOM and invisible to the
         * assertion. Opened by clicking each disclosure, which is what a person
         * does, rather than by setting `open` from script.
         */
        arrive: async (page) => {
          // Scoped to `main`, because the navigation shell carries its own
          // `<details>` ("More") which is hidden at desktop widths — clicking it
          // waits forever for an element that is never going to be visible.
          const summaries = page.locator("main details > summary");
          for (let index = 0; index < (await summaries.count()); index += 1) {
            const summary = summaries.nth(index);
            if (await summary.isVisible()) await summary.click();
          }
        },
      },
      { name: "inbox", path: () => "/app/inbox", marker: M.entry },
      { name: "files", path: () => "/app/files", marker: M.file },
      { name: "work", path: () => "/app/work", marker: M.task },
      {
        // Anchored at the owner's civil day. Anchoring at UTC's would be asking
        // the calendar to show a day the intention does not belong to.
        name: "calendar",
        path: () => `/app/calendar?date=${owner.ownerDay}`,
        marker: M.task,
      },
      {
        name: "search",
        path: () => "/app/search",
        marker: M.entry,
        arrive: async (page) => {
          await page.getByRole("searchbox").fill(M.entry);
          await page.getByRole("searchbox").press("Enter");
          await expect(page.getByText(M.entry).first()).toBeVisible({ timeout: 60_000 });
        },
      },
    ];

    for (const surface of SURFACES) {
      test(`${surface.name} shows ${owner.ownerDay}, never ${owner.utcDay}`, async ({ page }) => {
        await visit(page, surface.path(fixture));
        await settle(page);
        if (surface.arrive) await surface.arrive(page, fixture);

        const text = await settle(page);
        const wrong = daySpellings(owner.locale, "UTC", owner.boundary);
        const right = daySpellings(owner.locale, owner.zone, owner.boundary);

        // First: the surface really rendered this fixture. Everything below is
        // worthless without it.
        expect(
          text,
          `${surface.name} never rendered the fixture ("${surface.marker}"), so nothing it says about dates means anything`,
        ).toContain(surface.marker);

        // The claim the initiative exists to make, in both directions.
        const shownWrong = wrong.filter((spelling) => text.includes(spelling));
        expect(
          shownWrong,
          `${surface.name} rendered the UTC day — the owner is in ${owner.zone}`,
        ).toEqual([]);

        const shownRight = right.filter((spelling) => text.includes(spelling));
        expect(
          shownRight.length,
          `${surface.name} shows none of the owner's day spellings ${JSON.stringify(right)}`,
        ).toBeGreaterThan(0);
      });
    }

    test(`the Home header names the owner's today, not the host's`, async ({ page }) => {
      await visit(page, "/app");
      const text = await settle(page);

      /*
       * `LDC-HOME-001`. The header is the initiative's clearest case: it used to
       * format `new Date()` with no zone while the list beneath it used
       * `workProjection.timezone`, so between 21:00 and midnight one screen
       * named two days.
       *
       * Computed at assertion time in the owner's zone, upper-cased the way the
       * header renders it. This is a live "now", so it is only a *distinguishing*
       * assertion while the owner's zone and the host's are on different dates —
       * which is recorded either way rather than assumed.
       */
      const todayInOwnerZone = new Intl.DateTimeFormat(owner.locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: owner.zone,
      })
        .format(new Date())
        .toUpperCase();

      expect(text, "the Home header does not name the owner's today").toContain(todayInOwnerZone);

      const nowIso = new Date().toISOString();
      test.info().annotations.push({
        type: "home-header",
        description:
          `owner day ${civilDateIn(owner.zone, nowIso)} vs UTC day ${civilDateIn("UTC", nowIso)} at ${nowIso}`,
      });
    });

    test(`DST holds in the ${owner.dst.hemisphere} hemisphere: the same clock, two offsets`, async ({ page }) => {
      /*
       * Two instants six months apart at the **same UTC clock time**. If the
       * zone's DST rule is being applied, their rendered times differ by exactly
       * an hour; if anything renders in UTC or a fixed offset, they are
       * identical. A fixed-offset zone cannot pass this.
       */
      const expectedA = render("dayAndTime", owner.locale, owner.zone, owner.dst.a);
      const expectedB = render("dayAndTime", owner.locale, owner.zone, owner.dst.b);
      expect(
        expectedA.slice(-5),
        "the fixture's two instants render at the same clock time, so this case cannot fail",
      ).not.toBe(expectedB.slice(-5));

      for (const [instant, expected] of [
        [owner.dst.a, expectedA],
        [owner.dst.b, expectedB],
      ] as const) {
        const entryId = instant === owner.dst.a ? fixture.dstEntries.a : fixture.dstEntries.b;
        await visit(page, `/app/inbox/${entryId}`);
        const text = await settle(page);
        expect(
          text,
          `the ${owner.dst.hemisphere} DST case rendered the wrong offset for ${instant}`,
        ).toContain(expected);
        expect(
          text,
          `${instant} rendered in UTC rather than ${owner.zone}`,
        ).not.toContain(render("dayAndTime", owner.locale, "UTC", instant));
      }
    });
  });
}

/**
 * The cross-owner claim, which neither describe block can make on its own.
 *
 * Both owners hold the *same* instant. If the two renderings were equal, every
 * assertion above could still pass with a surface pinned to one arbitrary zone.
 */
test.describe("one instant, two owners, two different days", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  test("the two owners' zones disagree about the calendar date of a shared instant", () => {
    const shared = "2026-05-14T23:00:00.000Z";
    const ahead = civilDateIn("Pacific/Auckland", shared);
    const behind = civilDateIn("America/Los_Angeles", shared);
    expect(ahead).toBe("2026-05-15");
    expect(behind).toBe("2026-05-14");
    expect(ahead, "the two owners cannot disagree, so the journey proves less than it claims").not.toBe(behind);
  });
});
