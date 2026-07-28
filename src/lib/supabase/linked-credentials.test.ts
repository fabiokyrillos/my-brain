import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => {
  const execFileSync = vi.fn();
  return { execFileSync, default: { execFileSync } };
});

// The helper reads the linked project ref relative to `import.meta.url`, which
// Vitest does not resolve to a file URL. The ref itself is not what these tests
// are about, so it is supplied directly.
vi.mock("node:fs", () => {
  const readFileSync = vi.fn(() => "ulvwzqlpsjyrnqzfxmck\n");
  return { readFileSync, default: { readFileSync } };
});

const { execFileSync } = await import("node:child_process");
const { getLinkedSupabaseCredentials } = await import("../../../scripts/linked-supabase.mjs");

const mocked = vi.mocked(execFileSync);

// Every remote smoke resolves its credentials through this helper by shelling
// out to the Supabase CLI. The CLI flushes telemetry *after* writing its
// result, and when that flush times out ("Timeout while shutting down
// PostHog") it exits non-zero with the complete, valid JSON already on stdout.
// `execFileSync` throws on any non-zero exit, so a telemetry hiccup made an
// otherwise-successful credential lookup fatal — observed failing two of three
// consecutive runs during the Pre-2E cutover, which is what a phase gate that
// must be deterministic cannot tolerate.

const KEY_LIST = JSON.stringify([
  { name: "service_role", type: "legacy", api_key: "service-role-key-value" },
  { name: "anon", type: "publishable", api_key: "publishable-key-value" },
]);

function cliFailure(overrides: { stdout?: string | Buffer; stderr?: string }) {
  return Object.assign(
    new Error(
      "Command failed: cmd.exe /d /s /c npx supabase projects api-keys --project-ref x --output json",
    ),
    { status: 1, stdout: overrides.stdout ?? "", stderr: overrides.stderr ?? "" },
  );
}

describe("linked Supabase credential resolution", () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it("returns the project credentials when the CLI exits cleanly", () => {
    mocked.mockReturnValue(KEY_LIST as never);

    const credentials = getLinkedSupabaseCredentials();

    expect(credentials.serviceRoleKey).toBe("service-role-key-value");
    expect(credentials.publishableKey).toBe("publishable-key-value");
    expect(credentials.url).toMatch(/^https:\/\/[a-z0-9]{20}\.supabase\.co$/);
  });

  it("still returns credentials when a telemetry flush fails after a complete answer", () => {
    mocked.mockImplementation(() => {
      throw cliFailure({
        stdout: KEY_LIST,
        stderr: "Timeout while shutting down PostHog. Some events may not have been sent.\n",
      });
    });

    expect(getLinkedSupabaseCredentials().serviceRoleKey).toBe("service-role-key-value");
  });

  it("accepts a Buffer stdout, which is what execFileSync attaches by default", () => {
    mocked.mockImplementation(() => {
      throw cliFailure({ stdout: Buffer.from(KEY_LIST, "utf8") });
    });

    expect(getLinkedSupabaseCredentials().publishableKey).toBe("publishable-key-value");
  });

  it("throws when the CLI fails with no usable answer, so a real outage is not masked", () => {
    mocked.mockImplementation(() => {
      throw cliFailure({ stdout: "", stderr: "Access token not provided.\n" });
    });

    expect(() => getLinkedSupabaseCredentials()).toThrow();
  });

  it("throws when the CLI answers with JSON that carries no usable key pair", () => {
    mocked.mockImplementation(() => {
      throw cliFailure({ stdout: JSON.stringify([{ name: "anon", type: "publishable", api_key: "x" }]) });
    });

    expect(() => getLinkedSupabaseCredentials()).toThrow();
  });

  it("never puts key material in the error it raises", () => {
    // The rejected error object carries the CLI's stdout, and stdout is the key
    // list. Re-raising it verbatim printed a live service-role key to the
    // terminal and into any CI log that captured the run.
    mocked.mockImplementation(() => {
      throw cliFailure({
        stdout: JSON.stringify([{ name: "anon", type: "publishable", api_key: "sb_publishable_LEAKED" }]),
        stderr: "boom",
      });
    });

    let raised: unknown;
    try {
      getLinkedSupabaseCredentials();
    } catch (error) {
      raised = error;
    }

    expect(raised).toBeInstanceOf(Error);
    // An uncaught throw prints the error's own enumerable properties too — that
    // is exactly how `stdout` put a live key on the terminal — so the whole
    // object is what has to be clean, not just the message.
    const error = raised as Error & Record<string, unknown>;
    const serialized = [
      error.message,
      error.stack ?? "",
      ...Object.keys(error).map((key) => String(error[key])),
    ].join("\n");
    expect(serialized).not.toContain("sb_publishable_LEAKED");
  });
});
