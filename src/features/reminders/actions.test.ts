import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/lib/auth/require-user";

import { IDLE_REMINDER_ACTION_STATE } from "./action-state";
import { applyReminderCommand } from "./actions";

/**
 * The write half (UX-12, DEC-6, DEC-7).
 *
 * These cases are written around the ways this can be wrong and cost the owner
 * something real: a reminder rescheduled to the wrong hour because the browser's
 * timezone was trusted, a forged control carrying a field belonging to another
 * command, a database refusal surfacing as raw SQL text, and a direct table
 * write sneaking back in after Phase 2F removed the grant that permitted one.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REMINDER_ID = "44444444-4444-4444-8444-444444444444";

const EXPECTED_STATE = {
  status: "scheduled",
  remindAt: "2026-12-05T09:00:00+00:00",
  title: "Ligar para o contador",
  important: false,
};

type RpcError = { code?: string; details?: string; message?: string } | null;

function setup(options: { timezone?: string; rpcError?: RpcError } = {}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const fromCalls: { table: string; methods: string[] }[] = [];

  const supabase = {
    from(table: string) {
      const call = { table, methods: [] as string[] };
      fromCalls.push(call);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "insert", "update", "delete", "upsert"]) {
        builder[method] = (...args: unknown[]) => {
          call.methods.push(method);
          void args;
          return builder;
        };
      }
      builder.maybeSingle = async () => ({
        data: { timezone: options.timezone ?? "America/Sao_Paulo" },
        error: null,
      });
      return builder;
    },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: null, error: options.rpcError ?? null };
    }),
  };

  vi.mocked(requireUser).mockResolvedValue({
    supabase,
    user: { id: USER_ID },
  } as unknown as Awaited<ReturnType<typeof requireUser>>);

  return { rpcCalls, fromCalls };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  // React sends these on every Server Action submit; every schema is `.strict()`,
  // so the action has to filter them or no form works at all.
  data.append("$ACTION_ID_test", "1");
  return data;
}

const base = {
  locale: "pt-BR",
  reminderId: REMINDER_ID,
  operationKey: "r5-cancel-abc-12345",
  expectedState: JSON.stringify(EXPECTED_STATE),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('every "use server" module exports only async functions', () => {
  it("holds across the whole repository", () => {
    /*
     * This shipped and reached the deployed project.
     *
     * `actions.ts` exported the idle form-state constant next to the Server
     * Action. That compiles, typechecks, and passes every test in this file —
     * and then throws at request time with
     *
     *     A "use server" file can only export async functions, found object.
     *
     * so the reminders page rendered its error boundary and the failure looked
     * like a data problem. `memories/edit-state.ts` already existed for exactly
     * this reason; the convention was there and simply not followed.
     *
     * Checked repository-wide rather than for this feature alone: the constraint
     * is the framework's, so the guard belongs at the framework's scope. Type
     * exports are erased at build time and are allowed.
     */
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
        const source = readFileSync(full, "utf8");
        if (!/^\s*["']use server["']/.test(source)) continue;
        const relative = path.relative(process.cwd(), full).split(path.sep).join("/");
        for (const line of source.split("\n")) {
          const exported = /^export\s+(?!type\b|interface\b)(\S+)(?:\s+(\S+))?/.exec(line.trim());
          if (!exported) continue;
          const [, first, second] = exported;
          const isAsyncFunction = first === "async" && second === "function";
          if (!isAsyncFunction) offenders.push(`${relative}: ${line.trim().slice(0, 72)}`);
        }
      }
    };
    walk(path.resolve(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});

describe("the command reaches the boundary, and only the boundary", () => {
  it("calls the RPC with the four arguments and no table write", async () => {
    const { rpcCalls, fromCalls } = setup();
    const state = await applyReminderCommand(
      IDLE_REMINDER_ACTION_STATE,
      form({ ...base, action: "cancel" }),
    );

    expect(state.status).toBe("success");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("apply_reminder_command_v1");
    expect(rpcCalls[0].args).toEqual({
      p_reminder_id: REMINDER_ID,
      p_command: { kind: "cancel" },
      p_expected_state: EXPECTED_STATE,
      p_operation_key: base.operationKey,
    });

    // Phase 2F revoked UPDATE/DELETE on this table. The only `from` call this
    // action may make is the profile read.
    expect(fromCalls.map((call) => call.table)).toEqual(["profiles"]);
    for (const call of fromCalls) {
      expect(call.methods).not.toContain("update");
      expect(call.methods).not.toContain("delete");
      expect(call.methods).not.toContain("insert");
    }
  });

  it("sends each command with its own fields and nothing else", async () => {
    const cases: [Record<string, string>, Record<string, unknown>][] = [
      [{ action: "snooze", snoozeMinutes: "180" }, { kind: "snooze", snoozeMinutes: 180 }],
      [{ action: "restore" }, { kind: "restore" }],
      [
        { action: "edit", title: "Novo título", important: "on" },
        { kind: "edit", title: "Novo título", important: true },
      ],
    ];
    for (const [fields, expected] of cases) {
      const { rpcCalls } = setup();
      const expectedState =
        fields.action === "restore"
          ? JSON.stringify({ ...EXPECTED_STATE, status: "cancelled" })
          : base.expectedState;
      await applyReminderCommand(
        IDLE_REMINDER_ACTION_STATE,
        form({ ...base, expectedState, ...fields }),
      );
      expect(rpcCalls[0]?.args.p_command).toEqual(expected);
    }
  });
});

describe("the timezone comes from the profile, never from the browser", () => {
  it("converts a local wall-clock with the owner's stored zone", async () => {
    const { rpcCalls } = setup({ timezone: "America/Sao_Paulo" });
    await applyReminderCommand(
      IDLE_REMINDER_ACTION_STATE,
      form({ ...base, action: "reschedule", remindAtLocal: "2026-12-20T18:30" }),
    );
    // São Paulo is UTC-03:00 on that date, and the instant must carry it
    // explicitly — the RPC refuses one with no offset.
    expect(rpcCalls[0].args.p_command).toEqual({
      kind: "reschedule",
      remindAt: "2026-12-20T18:30:00-03:00",
    });
  });

  it("produces a different instant for the same wall-clock in another zone", async () => {
    // The case a browser-derived offset gets wrong for anyone travelling.
    const { rpcCalls } = setup({ timezone: "Europe/Lisbon" });
    await applyReminderCommand(
      IDLE_REMINDER_ACTION_STATE,
      form({ ...base, action: "reschedule", remindAtLocal: "2026-12-20T18:30" }),
    );
    expect(rpcCalls[0].args.p_command).toEqual({
      kind: "reschedule",
      remindAt: "2026-12-20T18:30:00+00:00",
    });
  });

  it("ignores a timezone submitted in the form", async () => {
    const { rpcCalls } = setup({ timezone: "America/Sao_Paulo" });
    const state = await applyReminderCommand(
      IDLE_REMINDER_ACTION_STATE,
      form({
        ...base,
        action: "reschedule",
        remindAtLocal: "2026-12-20T18:30",
        timezone: "Pacific/Kiritimati",
      }),
    );
    // The extra field makes the strict schema reject outright rather than being
    // silently dropped — which is the stronger of the two safe behaviours.
    expect(state.status).toBe("error");
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("refusals are localized sentences, never raw SQL", () => {
  const cases: [RpcError, string, string][] = [
    [
      { code: "55000", details: "G5_REMINDER_TRANSITION_NOT_ALLOWED" },
      "pt-BR",
      "Esta ação não é possível no estado atual do lembrete.",
    ],
    [
      { code: "55000", details: "G5_REMINDER_EDIT_TASK_LINKED" },
      "en",
      "The title comes from the linked task. Rename the task to change it.",
    ],
    [{ code: "P0002", message: "Reminder not found" }, "pt-BR", "Lembrete não encontrado."],
    [{ code: "42501" }, "en", "Your session expired."],
  ];

  for (const [rpcError, locale, message] of cases) {
    it(`maps ${rpcError?.details ?? rpcError?.code} to its ${locale} sentence`, async () => {
      setup({ rpcError });
      const state = await applyReminderCommand(
        IDLE_REMINDER_ACTION_STATE,
        form({ ...base, locale, action: "cancel" }),
      );
      expect(state.status).toBe("error");
      expect(state.message).toBe(message);
      expect(state.reminderId).toBe(REMINDER_ID);
    });
  }

  it("never leaks the database's own message", async () => {
    setup({ rpcError: { code: "23514", message: 'violates check constraint "reminders_title_check"' } });
    const state = await applyReminderCommand(
      IDLE_REMINDER_ACTION_STATE,
      form({ ...base, action: "cancel" }),
    );
    expect(state.message).not.toContain("constraint");
    expect(state.message).not.toContain("reminders_");
  });
});

describe("a forged control does not reach the database", () => {
  it("refuses cancel carrying a reschedule field", async () => {
    const { rpcCalls } = setup();
    const state = await applyReminderCommand(
      IDLE_REMINDER_ACTION_STATE,
      form({ ...base, action: "cancel", remindAtLocal: "2026-12-20T18:30" }),
    );
    expect(state.status).toBe("error");
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses a snooze interval outside the preset set", async () => {
    const { rpcCalls } = setup();
    const state = await applyReminderCommand(
      IDLE_REMINDER_ACTION_STATE,
      form({ ...base, action: "snooze", snoozeMinutes: "7" }),
    );
    expect(state.status).toBe("error");
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses an action the claimed pre-state cannot accept, before the round trip", async () => {
    const { rpcCalls } = setup();
    const state = await applyReminderCommand(
      IDLE_REMINDER_ACTION_STATE,
      form({
        ...base,
        expectedState: JSON.stringify({ ...EXPECTED_STATE, status: "sent" }),
        action: "restore",
      }),
    );
    expect(state.status).toBe("error");
    expect(state.message).toBe("Esta ação não é possível no estado atual do lembrete.");
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses an unparseable expected state", async () => {
    const { rpcCalls } = setup();
    const state = await applyReminderCommand(
      IDLE_REMINDER_ACTION_STATE,
      form({ ...base, expectedState: "{", action: "cancel" }),
    );
    expect(state.status).toBe("error");
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("the result names the row it belongs to", () => {
  it("carries the reminder id and the action on success", async () => {
    setup();
    const state = await applyReminderCommand(
      IDLE_REMINDER_ACTION_STATE,
      form({ ...base, action: "snooze", snoozeMinutes: "60" }),
    );
    // One banner per page would otherwise label the wrong row.
    expect(state).toMatchObject({
      status: "success",
      reminderId: REMINDER_ID,
      action: "snooze",
      message: "Lembrete adiado.",
    });
  });
});
