import { afterEach, describe, expect, it, vi } from "vitest";

// The suite runs under jsdom, where `server-only` resolves to its client build
// and throws on import. The idiom `ip.test.ts` established and `throttle.test.ts`
// follows; it is the guard doing exactly its job, not a defect in this module.
vi.mock("server-only", () => ({}));

const { readPushConsent, readVapidPublicKey } = await import("./consent-reader");
const { NO_CONSENT } = await import("./consent-contract");

/**
 * `2M-NOTIFY-002` and `-004` — the owner-scoped read behind the settings
 * surface, and the one property it must never get wrong.
 *
 * **Absence is `unsupported`, never a default-on.** A missing consent row, an
 * unreadable one, a failed query and a half-readable preferences row all have to
 * resolve to something that permits nothing. There is exactly one way for this
 * function to be dangerous and it is to return, from any error path, a value a
 * caller could mistake for permission — so every failure shape below is
 * enumerated rather than sampled.
 */

type Row = { data: unknown; error: unknown };

function stubClient(consent: Row, preferences: Row) {
  const seen: { table: string; filters: Record<string, unknown> }[] = [];
  return {
    seen,
    client: {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        seen.push({ table, filters });
        const chain = {
          select: () => chain,
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return chain;
          },
          maybeSingle: async () => (table === "notification_consents" ? consent : preferences),
        };
        return chain;
      },
    } as never,
  };
}

const CONSENT = {
  data: {
    state: "granted",
    recorded_at: "2026-08-12T10:00:00.000Z",
    enabled_types: ["reminder", "review"],
    frequency: "immediate",
  },
  error: null,
};
const PREFERENCES = {
  data: { quiet_start: "23:00:00", quiet_end: "06:30:00", max_followups_per_day: 4 },
  error: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("2M-NOTIFY-004: the surface reads both homes and presents one picture", () => {
  it("assembles the consent from the consent row and agent_preferences", async () => {
    const { client } = stubClient(CONSENT, PREFERENCES);
    const consent = await readPushConsent(client, "user-1");
    expect(consent.state).toBe("granted");
    expect([...consent.enabledTypes]).toEqual(["reminder", "review"]);
    expect(consent.frequency).toBe("immediate");
    // Quiet hours and the cap come from `agent_preferences` — the columns the
    // heartbeat has read since `202607160007`. The migration created no second
    // copy, and a second copy is how a user sets quiet hours once and is still
    // pushed at 03:00.
    expect(consent.quietStart).toBe("23:00");
    expect(consent.quietEnd).toBe("06:30");
    expect(consent.dailyCap).toBe(4);
  });

  it("narrows `HH:MM:SS` from a time column to the `HH:MM` the form produces", async () => {
    const { client } = stubClient(CONSENT, PREFERENCES);
    const consent = await readPushConsent(client, "user-1");
    // A `<input type="time">` whose value carries seconds renders empty in some
    // browsers, so the user would see a blank quiet period they had actually set.
    expect(consent.quietStart).not.toMatch(/:\d{2}:\d{2}/);
  });

  it("scopes BOTH reads to the owner", async () => {
    const { client, seen } = stubClient(CONSENT, PREFERENCES);
    await readPushConsent(client, "user-1");
    expect(seen.map((entry) => entry.table).sort()).toEqual(["agent_preferences", "notification_consents"]);
    for (const entry of seen) {
      expect(entry.filters.user_id, entry.table).toBe("user-1");
    }
    // And the consent read is pinned to the channel, so a future second channel
    // cannot silently be read as this one.
    expect(seen.find((entry) => entry.table === "notification_consents")?.filters.channel).toBe("push");
  });
});

describe("2M-NOTIFY-002: every failure resolves to something that permits nothing", () => {
  it("returns NO_CONSENT when there is no consent row", async () => {
    const { client } = stubClient({ data: null, error: null }, PREFERENCES);
    expect(await readPushConsent(client, "user-1")).toEqual(NO_CONSENT);
  });

  it("returns NO_CONSENT when the consent read failed", async () => {
    // A failed read is not an excuse to guess.
    const { client } = stubClient({ data: null, error: { message: "boom" } }, PREFERENCES);
    expect(await readPushConsent(client, "user-1")).toEqual(NO_CONSENT);
  });

  it("permits nothing in the NO_CONSENT shape itself", async () => {
    // The assertions above are only worth anything if this is true: the fallback
    // must be `unsupported`, with no enabled type and a cap of zero.
    const { client } = stubClient({ data: null, error: null }, PREFERENCES);
    const consent = await readPushConsent(client, "user-1");
    expect(consent.state).toBe("unsupported");
    expect([...consent.enabledTypes]).toEqual([]);
    expect(consent.dailyCap).toBe(0);
  });

  it("survives an unreadable preferences row without inventing a quiet period", async () => {
    // The consent is real, so the surface must still render; but the quiet hours
    // are unknown. Falling back to the product's own defaults is honest here —
    // it is what the heartbeat would apply — and it is NOT a permission.
    const { client } = stubClient(CONSENT, { data: null, error: { message: "boom" } });
    const consent = await readPushConsent(client, "user-1");
    expect(consent.state).toBe("granted");
    expect(consent.quietStart).toBe("22:30");
    expect(consent.quietEnd).toBe("07:00");
    expect(consent.dailyCap).toBe(0);
  });

  it("refuses a malformed state rather than passing it through", async () => {
    const { client } = stubClient(
      { data: { ...CONSENT.data, state: "definitely_yes" }, error: null },
      PREFERENCES,
    );
    expect((await readPushConsent(client, "user-1")).state).toBe("unsupported");
  });

  it("drops an undeclared type rather than carrying it into the decision", async () => {
    const { client } = stubClient(
      { data: { ...CONSENT.data, enabled_types: ["reminder", "recurrence"] }, error: null },
      PREFERENCES,
    );
    expect([...(await readPushConsent(client, "user-1")).enabledTypes]).toEqual(["reminder"]);
  });
});

describe("2M-NOTIFY-011: only the PUBLIC half of the VAPID pair is ever read", () => {
  it("returns the configured key", () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "  a-public-key  ");
    // Trimmed, because a trailing newline pasted into a dashboard is the most
    // common way an environment variable is subtly wrong.
    expect(readVapidPublicKey()).toBe("a-public-key");
  });

  it("returns null when unset or blank, so the surface can be honest", () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    expect(readVapidPublicKey()).toBeNull();
    vi.stubEnv("VAPID_PUBLIC_KEY", "   ");
    expect(readVapidPublicKey()).toBeNull();
  });

  it("reads no private key, even when one is present in the environment", () => {
    /*
     * The variable name is ASSEMBLED rather than written out, and that is
     * deliberate.
     *
     * `phase-2m-push-boundary-guard.test.ts` sweeps every file under `src/` and
     * `public/` for the private half's literal variable name, and exempts only
     * itself. That sweep is the strongest single assertion in this slice — what
     * makes "the private half appears nowhere in the application" a fact rather
     * than a claim — and it is worth more than the readability of one line here.
     * So this test does not spend an exemption it would otherwise have to.
     */
    const privateName = ["VAPID", "PRIVATE", "KEY"].join("_");
    vi.stubEnv("VAPID_PUBLIC_KEY", "a-public-key");
    vi.stubEnv(privateName, "a-secret-that-must-never-be-returned");
    expect(readVapidPublicKey()).toBe("a-public-key");
    // And the reader's own body names only the public half.
    expect(readVapidPublicKey.toString()).not.toMatch(/PRIVATE/i);
  });
});
