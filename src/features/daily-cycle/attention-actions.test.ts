import { describe, expect, it, vi } from "vitest";
import { loadMoreNeedsAttention } from "./attention-actions";
import { loadAttentionProjection } from "./attention-projection";
import { createClient } from "@/lib/supabase/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("./attention-projection", () => ({ loadAttentionProjection: vi.fn() }));

function client(user: { id: string } | null) {
  return { auth: { getUser: vi.fn(async () => ({ data: { user } })) } };
}

describe("loadMoreNeedsAttention", () => {
  it("returns session_expired without calling the projection when there is no authenticated user", async () => {
    vi.mocked(createClient).mockResolvedValue(client(null) as never);

    const result = await loadMoreNeedsAttention({ occurredAt: "2026-07-18T12:00:00.000Z", entryId: "entry-1" }, "pt-BR");

    expect(result).toEqual({ ok: false, code: "session_expired" });
    expect(loadAttentionProjection).not.toHaveBeenCalled();
  });

  it("returns the next page for an authenticated user, forwarding the supplied cursor and locale", async () => {
    const supabase = client({ id: "user-1" });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const page = { items: [], hasNext: false, nextCursor: null };
    vi.mocked(loadAttentionProjection).mockResolvedValue(page);

    const cursor = { occurredAt: "2026-07-18T12:00:00.000Z", entryId: "entry-1" };
    const result = await loadMoreNeedsAttention(cursor, "en");

    expect(result).toEqual({ ok: true, page });
    expect(loadAttentionProjection).toHaveBeenCalledWith(supabase, { locale: "en", cursor });
  });

  it("returns action_failed instead of throwing when the projection query fails", async () => {
    vi.mocked(createClient).mockResolvedValue(client({ id: "user-1" }) as never);
    vi.mocked(loadAttentionProjection).mockRejectedValue(new Error("boom"));

    const result = await loadMoreNeedsAttention({ occurredAt: "2026-07-18T12:00:00.000Z", entryId: "entry-1" }, "pt-BR");

    expect(result).toEqual({ ok: false, code: "action_failed" });
  });
});
