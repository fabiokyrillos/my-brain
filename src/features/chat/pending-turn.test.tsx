import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PENDING_TURN_WINDOW_MS, pendingTurn } from "./pending-turn";
import { PENDING_TURN_REFRESH_MS, PendingTurnIndicator } from "./pending-turn-indicator";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const ASKED = "2026-11-14T12:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(ASKED) + ms);

describe("a turn in flight is read from the thread itself (Life Brain E.5)", () => {
  it("is thinking while the last message is the owner's and recent", () => {
    expect(pendingTurn([{ role: "user", created_at: ASKED }], at(10_000))).toEqual({
      state: "thinking",
      deadline: Date.parse(ASKED) + PENDING_TURN_WINDOW_MS,
    });
  });

  it("is unanswered once the window has passed, so it never spins forever", () => {
    expect(pendingTurn([{ role: "user", created_at: ASKED }], at(PENDING_TURN_WINDOW_MS))).toEqual({ state: "unanswered" });
  });

  it("is nothing when the assistant answered last, or the thread is empty", () => {
    expect(pendingTurn([{ role: "user", created_at: ASKED }, { role: "assistant", created_at: ASKED }], at(1))).toBeNull();
    expect(pendingTurn([], at(1))).toBeNull();
  });

  it("is nothing for a timestamp it cannot read", () => {
    expect(pendingTurn([{ role: "user", created_at: "not a date" }], at(1))).toBeNull();
  });
});

describe("the indicator refreshes until the answer lands or the deadline passes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(0));
    refresh.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("says the assistant is thinking and asks the server again on an interval", () => {
    render(<PendingTurnIndicator agentName="Michael" locale="pt-BR" turn={{ state: "thinking", deadline: Date.parse(ASKED) + 7_000 }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Michael está pensando…");

    act(() => vi.advanceTimersByTime(PENDING_TURN_REFRESH_MS * 2));
    expect(refresh).toHaveBeenCalledTimes(2);

    // Past the deadline it stops asking.
    act(() => vi.advanceTimersByTime(PENDING_TURN_REFRESH_MS * 5));
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("says the question went unanswered, and does not refresh", () => {
    render(<PendingTurnIndicator agentName="Michael" locale="en" turn={{ state: "unanswered" }} />);
    expect(screen.getByText(/went unanswered/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(PENDING_TURN_REFRESH_MS * 3));
    expect(refresh).not.toHaveBeenCalled();
  });
});
