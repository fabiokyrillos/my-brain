import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const person = { data: { id: "11111111-1111-4111-8111-111111111111", name: "Ana" }, error: null as unknown };
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(async () => ({
    user: { id: "u1" },
    supabase: {
      rpc,
      from: () => {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => person };
        return chain;
      },
    },
  })),
}));

const { setPersonBirthday } = await import("./actions");
const { getBirthdayCopy } = await import("./copy");
const copy = getBirthdayCopy("pt-BR");
const idle = { status: "idle" as const, message: "" };

function form(fields: Record<string, string>) {
  const data = new FormData();
  data.set("locale", "pt-BR");
  data.set("personId", person.data.id);
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => rpc.mockReset());

describe("setPersonBirthday", () => {
  it("sends the date and a title built from the person's stored name", async () => {
    rpc.mockResolvedValue({ data: { changed: true }, error: null });
    const result = await setPersonBirthday(idle, form({ intent: "set", day: "5", month: "5", year: "" }));
    expect(rpc).toHaveBeenCalledWith("set_person_birthday", {
      p_person_id: person.data.id, p_month: 5, p_day: 5, p_year: null, p_reminder_title: "Aniversário de Ana",
    });
    expect(result).toEqual({ status: "success", message: copy.saved });
  });

  it("refuses a date that does not exist without calling the database", async () => {
    const result = await setPersonBirthday(idle, form({ intent: "set", day: "31", month: "4", year: "" }));
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "error", message: copy.invalid });
  });

  it("clears with nulls, and says the reminder ended", async () => {
    rpc.mockResolvedValue({ data: { changed: true }, error: null });
    const result = await setPersonBirthday(idle, form({ intent: "clear" }));
    expect(rpc).toHaveBeenCalledWith("set_person_birthday", {
      p_person_id: person.data.id, p_month: null, p_day: null, p_year: null, p_reminder_title: null,
    });
    expect(result.message).toBe(copy.cleared);
  });

  it("says nothing changed when the database says so", async () => {
    rpc.mockResolvedValue({ data: { changed: false }, error: null });
    expect((await setPersonBirthday(idle, form({ intent: "set", day: "5", month: "5", year: "" }))).message).toBe(copy.unchanged);
  });
});
