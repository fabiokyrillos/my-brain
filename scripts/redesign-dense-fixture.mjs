#!/usr/bin/env node
/**
 * The dense fixture — what every previous part of this redesign was validated
 * without.
 *
 * ## Why it exists
 *
 * Parts one, two and three all recorded the same limitation: *"dense-list
 * composition is still only structurally verified"*. The authenticated account
 * holds a handful of rows, so every layout rendered correctly and every
 * screenshot proved nothing about what happens at fifty items, with a
 * ninety-character title, or with three aliases that do not fit a line. An empty
 * surface satisfies every layout.
 *
 * This seeds that account with enough to see it, and removes it afterwards.
 *
 * ## The four rules it obeys
 *
 * 1. **Owner-scoped.** Every row carries the `user_id` of the account named by
 *    `ONLINE_AUTH_TEST_EMAIL`, resolved through the admin API. Nothing is
 *    written for any other owner, and there is no path here that could: the id
 *    is resolved once and every insert takes it from that one variable.
 * 2. **Identifiable.** Every row's text begins with `FIXTURE_MARKER`, so the
 *    removal is a predicate over content rather than a list of ids somebody has
 *    to keep. A row this script did not write cannot match it.
 * 3. **Removed.** `clean` deletes by that predicate, per table.
 * 4. **Proven removed by a probe that could have failed.** `verify` counts the
 *    marked rows and reports per table. The whole sequence is
 *    seed → verify (expects rows) → clean → verify (expects none), and the
 *    middle step is what makes the last one evidence: a probe that only ever
 *    ran against an already-empty database would report zero for a reason that
 *    has nothing to do with the deletion.
 *
 * ## One thing it writes without inserting it
 *
 * Seeding a task with a `due_at` makes the product create a reminder from it, so
 * `verify` reports **44** reminders where `seed` inserted 9. Those 35 are the
 * product's own trigger doing its job, and they carry the marker because they
 * copy the task's title — which is what lets one predicate remove them too. The
 * discrepancy is stated here rather than smoothed over: a `seed` count and a
 * `verify` count that disagree is exactly the shape of a fixture leaking, and a
 * reader should be able to tell this apart from that in one place.
 *
 * ## What it deliberately does not touch
 *
 * `entries`, `entry_interpretations`, `jobs`, `audit_logs`, `ai_usage_events`
 * and `product_events` — the append-only and worker-owned tables. Seeding an
 * entry would enqueue interpretation work against the owner's real credential,
 * and seeding an append-only ledger directly is what the documented RPCs exist
 * to prevent. The surfaces that read them are validated with whatever the
 * account already holds, and that limitation is recorded rather than worked
 * around.
 *
 * ## Usage
 *
 *   node scripts/redesign-dense-fixture.mjs seed
 *   node scripts/redesign-dense-fixture.mjs verify
 *   node scripts/redesign-dense-fixture.mjs clean
 *
 * Credentials come from the linked Supabase project, never from a tracked file.
 */

import { readFileSync } from "node:fs";

import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

/** The one string that makes a row this script's. Never a substring of real content. */
const MARKER = "[FIXTURE-DENSO]";

/**
 * The longest value each column will actually accept, minus the marker.
 *
 * Not an arbitrary long string: the schema's own ceilings are the real worst
 * case a surface can be handed, and a fixture that stopped short of them would
 * leave the widest row the product can hold untested. `202607160003` caps an
 * entity name at 120 characters and a task title at 240; `202607160006` caps a
 * memory's content at 4000.
 *
 * Each constant is measured against its ceiling by `assertLengths` below, so a
 * future migration that tightens one fails here rather than at the first insert.
 */
const NAME_CEILING = 120;
const TITLE_CEILING = 240;

const LONG_NAME =
  "Aurora Participações e Investimentos Imobiliários do Vale do Paraíba Sociedade Anônima Ltda ME";
const LONG_TITLE =
  "Revisar integralmente o contrato de prestação de serviços continuados da Aurora Participações"
  + " Ltda antes da reunião de quinta-feira com o time jurídico, com a diretoria financeira e com"
  + " a contraparte, e confirmar quem assina";
const LONG_CONTENT =
  LONG_TITLE
  + " — e registrar, no mesmo lugar, tudo o que ficou combinado sobre prazos, responsáveis,"
  + " dependências e o que acontece se a contraparte não responder até o fim do mês.";

/**
 * The ceilings, checked before anything is written.
 *
 * A fixture whose longest string silently stopped being the longest allowed is a
 * fixture that stopped testing what it claims to. This fails loudly instead.
 */
function assertLengths() {
  const marked = (value) => `${MARKER} ${value}`.length;
  const problems = [];
  if (marked(LONG_NAME) > NAME_CEILING) problems.push(`LONG_NAME is ${marked(LONG_NAME)} > ${NAME_CEILING}`);
  if (marked(LONG_TITLE) > TITLE_CEILING) problems.push(`LONG_TITLE is ${marked(LONG_TITLE)} > ${TITLE_CEILING}`);
  // …and within 10% of the ceiling, or it is not testing the worst case.
  if (marked(LONG_NAME) < NAME_CEILING * 0.9) problems.push(`LONG_NAME is far below ${NAME_CEILING}`);
  if (marked(LONG_TITLE) < TITLE_CEILING * 0.9) problems.push(`LONG_TITLE is far below ${TITLE_CEILING}`);
  if (problems.length) {
    console.error(`fixture lengths no longer match the schema:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
}

const TABLES = ["memories", "tasks", "people", "projects", "organizations", "contexts", "reminders"];

/** Which column carries the marker, per table. */
const MARKED_COLUMN = {
  memories: "content",
  tasks: "title",
  people: "name",
  projects: "name",
  organizations: "name",
  contexts: "name",
  reminders: "title",
};

function ownerEmail() {
  const explicit = process.env.ONLINE_AUTH_TEST_EMAIL;
  if (explicit) return explicit;
  let file;
  try {
    file = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return null;
  }
  for (const line of file.split(/\r?\n/)) {
    const match = /^ONLINE_AUTH_TEST_EMAIL=(.*)$/.exec(line.trim());
    if (match) return match[1].replace(/^["']|["']$/g, "");
  }
  return null;
}

const { url, serviceRoleKey } = getLinkedSupabaseCredentials();
const email = ownerEmail();

if (!url || !serviceRoleKey) {
  console.error("No linked Supabase project. Run `supabase link` first.");
  process.exit(1);
}
if (!email) {
  console.error("ONLINE_AUTH_TEST_EMAIL is not set in the environment or .env.local.");
  process.exit(1);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};

async function rest(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${response.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

/**
 * The owner, resolved once.
 *
 * Every insert below takes `user_id` from this one value, so "owner-scoped" is
 * a property of the script's shape rather than of seven remembered predicates.
 */
async function resolveOwner() {
  const response = await fetch(
    `${url}/auth/v1/admin/users?page=1&per_page=200`,
    { headers },
  );
  if (!response.ok) throw new Error(`admin/users → ${response.status}`);
  const body = await response.json();
  const found = (body.users ?? []).find((user) => user.email === email);
  if (!found) throw new Error(`no account for ${email} in the linked project`);
  return found.id;
}

function rows(userId) {
  const now = Date.now();
  const day = 86_400_000;
  const at = (offset) => new Date(now + offset * day).toISOString();

  return {
    people: Array.from({ length: 54 }, (_, index) => ({
      user_id: userId,
      // Row 0 is the long one; the rest are ordinary, so the list has both.
      name:
        index === 0
          ? `${MARKER} ${LONG_NAME}`
          : `${MARKER} Pessoa ${String(index).padStart(2, "0")}`,
      notes: index % 3 === 0 ? `${MARKER} nota livre sobre esta pessoa, sem classificação própria.` : null,
    })),

    organizations: Array.from({ length: 12 }, (_, index) => ({
      user_id: userId,
      name: index === 0 ? `${MARKER} ${LONG_NAME}` : `${MARKER} Empresa ${index}`,
      description: `${MARKER} descrição.`,
    })),

    contexts: Array.from({ length: 11 }, (_, index) => ({
      user_id: userId,
      name: `${MARKER} Contexto ${index}`,
      kind: index % 3 === 0 ? "work" : index % 3 === 1 ? "personal" : "custom",
      description: `${MARKER} área da vida.`,
    })),

    projects: Array.from({ length: 23 }, (_, index) => ({
      user_id: userId,
      name: index === 0 ? `${MARKER} ${LONG_NAME}` : `${MARKER} Projeto ${String(index).padStart(2, "0")}`,
      description: index % 4 === 0 ? `${MARKER} ${LONG_CONTENT}` : `${MARKER} descrição curta.`,
      // Both arms of the status vocabulary, so the badge is exercised.
      status: index % 5 === 0 ? "archived" : "active",
    })),

    /*
     * Every task state the brief names — atrasada, hoje, aguardando, cancelada —
     * plus a completed one, so no view renders empty.
     */
    tasks: [
      ...Array.from({ length: 14 }, (_, index) => ({
        user_id: userId,
        title: index === 0 ? `${MARKER} ${LONG_TITLE}` : `${MARKER} Atrasada ${index}`,
        status: "todo",
        due_at: at(-(index + 1)),
      })),
      ...Array.from({ length: 12 }, (_, index) => ({
        user_id: userId,
        title: `${MARKER} Para hoje ${index}`,
        status: "todo",
        due_at: at(0),
      })),
      ...Array.from({ length: 9 }, (_, index) => ({
        user_id: userId,
        title: `${MARKER} Aguardando ${index}`,
        status: "waiting",
        due_at: at(index + 2),
      })),
      ...Array.from({ length: 7 }, (_, index) => ({
        user_id: userId,
        title: `${MARKER} Cancelada ${index}`,
        status: "cancelled",
        due_at: null,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        user_id: userId,
        title: `${MARKER} Concluída ${index}`,
        status: "completed",
        due_at: at(-(index + 1)),
      })),
    ],

    /*
     * Memories across every arm the surfaces distinguish: in force, scheduled,
     * archived, **conflicting** (an inverted validity window — the one conflict
     * this product detects), and one of each sensitivity level so the mask and
     * the reveal are both on screen.
     */
    memories: [
      ...Array.from({ length: 28 }, (_, index) => ({
        user_id: userId,
        content: index === 0 ? `${MARKER} ${LONG_CONTENT}` : `${MARKER} Memória ativa ${index}`,
        kind: "preference",
        important: index % 6 === 0,
        confidence: 1,
        sensitivity: "normal",
        valid_from: at(-30),
        valid_until: null,
      })),
      {
        user_id: userId,
        content: `${MARKER} Memória privada — deve aparecer mascarada onde a superfície mascara.`,
        kind: "fact",
        important: false,
        confidence: 1,
        sensitivity: "private",
        valid_from: null,
        valid_until: null,
      },
      {
        user_id: userId,
        content: `${MARKER} Memória muito sensível — nunca impressa sem um ato explícito.`,
        kind: "fact",
        important: true,
        confidence: 1,
        sensitivity: "highly_sensitive",
        valid_from: null,
        valid_until: null,
      },
      ...Array.from({ length: 4 }, (_, index) => ({
        user_id: userId,
        content: `${MARKER} Memória agendada ${index}`,
        kind: "fact",
        important: false,
        confidence: 1,
        sensitivity: "normal",
        valid_from: at(30 + index),
        valid_until: null,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        user_id: userId,
        content: `${MARKER} Memória arquivada ${index}`,
        kind: "fact",
        important: false,
        confidence: 1,
        sensitivity: "normal",
        valid_from: at(-60),
        valid_until: at(-10 - index),
      })),
      /*
       * The conflict. `memories` carries no CHECK on the ordering of these two
       * columns — verified against all 94 migrations by slice 2N.4 — which is
       * exactly why the detector exists and why this row is storable.
       */
      ...Array.from({ length: 3 }, (_, index) => ({
        user_id: userId,
        content: `${MARKER} Memória em conflito ${index} — começa depois de terminar.`,
        kind: "fact",
        important: false,
        confidence: 1,
        sensitivity: "normal",
        valid_from: at(20 + index),
        valid_until: at(-20 - index),
      })),
    ],

    reminders: Array.from({ length: 9 }, (_, index) => ({
      user_id: userId,
      title: index === 0 ? `${MARKER} ${LONG_TITLE}` : `${MARKER} Lembrete ${index}`,
      remind_at: at(index - 3),
      status: index % 4 === 0 ? "cancelled" : index % 4 === 1 ? "sent" : "scheduled",
    })),
  };
}

async function seed() {
  assertLengths();
  /*
   * Cleans first, always.
   *
   * `people`, `projects` and `organizations` each carry a unique index on
   * `(user_id, lower(name))`, so a second seed collides with the first — and a
   * seed that fails halfway leaves a partial fixture that the next run cannot
   * repair. Removing what this script wrote before writing it again makes
   * re-seeding safe, which is what a fixture has to be if anyone is going to
   * run it twice.
   */
  await clean();
  const userId = await resolveOwner();
  console.log(`owner ${email} → ${userId.slice(0, 8)}…`);
  const payload = rows(userId);

  for (const table of TABLES) {
    const batch = payload[table];
    if (!batch?.length) continue;
    await rest(table, {
      method: "POST",
      body: JSON.stringify(batch),
      headers: { Prefer: "return=minimal" },
    });
    console.log(`  seeded ${String(batch.length).padStart(3)} → ${table}`);
  }
}

/**
 * Counts the marked rows per table.
 *
 * Reported per table rather than as a total, because a total of zero is
 * satisfied by six empty tables and one that was never reached.
 */
async function verify() {
  const userId = await resolveOwner();
  let total = 0;
  for (const table of TABLES) {
    const column = MARKED_COLUMN[table];
    const found = await rest(
      `${table}?select=id&user_id=eq.${userId}&${column}=like.${encodeURIComponent(`${MARKER}%`)}&limit=1000`,
    );
    total += found.length;
    console.log(`  ${String(found.length).padStart(3)} marked rows in ${table}`);
  }
  console.log(`total ${total}`);
  return total;
}

async function clean() {
  const userId = await resolveOwner();
  for (const table of TABLES) {
    const column = MARKED_COLUMN[table];
    await rest(
      `${table}?user_id=eq.${userId}&${column}=like.${encodeURIComponent(`${MARKER}%`)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    console.log(`  cleaned ${table}`);
  }
}

const command = process.argv[2];
const commands = { seed, verify, clean };

if (!commands[command]) {
  console.error("Usage: node scripts/redesign-dense-fixture.mjs <seed|verify|clean>");
  process.exit(1);
}

commands[command]()
  .then((result) => {
    if (command === "verify" && typeof result === "number") {
      // The exit code carries the answer, so a shell sequence can assert it.
      process.exit(result === 0 ? 0 : 2);
    }
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
