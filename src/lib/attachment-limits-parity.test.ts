import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ATTACHMENT_LIMITS } from "./quotas";

/**
 * SH-QUOTA-006 / SH-STORAGE-004 — FINDINGS F-22's three copies, held together.
 *
 * The size limit and the MIME allowlist exist in three places that a reviewer
 * cannot see at once: the `storage.buckets` row, the `attachments.size_bytes`
 * CHECK constraint, and the TypeScript the upload action runs. A bucket that
 * accepts what the CHECK rejects does not fail loudly — it writes an object,
 * fails the metadata insert, and leaves an orphan. That is the exact shape of
 * the six orphans SH-DELETE-015 had to clean up by hand.
 *
 * So this test reads all of them and compares. It is deliberately a repository
 * test rather than a pgtap one: it must fail in the `app` job, on every PR,
 * without Docker.
 */

const REPO = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(REPO, relativePath), "utf8").replace(/\r\n/g, "\n");
}

const AGENT_OPERATIONS = read("supabase/migrations/202607160007_agent_operations.sql");
const UPLOAD_ACTION = read("src/features/agent/actions.ts");
const FILES_PAGE = read("src/app/[locale]/app/files/page.tsx");
const WORKER_ATTACHMENT = read("supabase/functions/process-jobs/attachment.ts");

describe("SH-QUOTA-006: one size limit, read back from every copy", () => {
  it("the bucket's file_size_limit is the constant", () => {
    const match = /insert into storage\.buckets[\s\S]*?values \('user-files', 'user-files', false, (\d+),/
      .exec(AGENT_OPERATIONS);
    expect(match, "the bucket definition must still be findable").not.toBeNull();
    expect(Number(match![1])).toBe(ATTACHMENT_LIMITS.maxBytes);
  });

  it("the attachments CHECK constraint is the constant", () => {
    const match = /size_bytes bigint not null check \(size_bytes between 1 and (\d+)\)/
      .exec(AGENT_OPERATIONS);
    expect(match, "the size_bytes CHECK must still be findable").not.toBeNull();
    expect(Number(match![1])).toBe(ATTACHMENT_LIMITS.maxBytes);
  });

  it("the upload action states no size of its own", () => {
    // The literal `26214400` inside the action was the third copy. Its absence
    // is the assertion: a re-introduced literal fails here by name.
    expect(UPLOAD_ACTION).not.toContain("26214400");
    expect(UPLOAD_ACTION).toContain("ATTACHMENT_LIMITS.maxBytes");
  });
});

describe("SH-QUOTA-006: one MIME allowlist, read back from every copy", () => {
  it("the bucket's allowed_mime_types is the constant, in the same order", () => {
    const match = /allowed_mime_types\)\n?values \([\s\S]*?array\[([^\]]+)\]/.exec(
      AGENT_OPERATIONS,
    );
    expect(match, "the bucket's MIME array must still be findable").not.toBeNull();
    const fromSql = match![1]
      .split(",")
      .map((entry) => entry.trim().replace(/^'|'$/g, ""));
    expect(fromSql).toEqual([...ATTACHMENT_LIMITS.mimeAllowlist]);
  });

  it("the upload action holds no allowlist of its own", () => {
    expect(UPLOAD_ACTION).not.toContain('"application/vnd.openxmlformats');
    expect(UPLOAD_ACTION).toContain("ATTACHMENT_LIMITS.mimeAllowlist");
  });

  it("the allowlist has no duplicates and no wildcards", () => {
    // A wildcard entry would make the allowlist an allow-anything, and a
    // duplicate is the fingerprint of a hand-merged edit.
    const list = [...ATTACHMENT_LIMITS.mimeAllowlist];
    expect(new Set(list).size).toBe(list.length);
    for (const type of list) expect(type).not.toContain("*");
  });
});

describe("SH-STORAGE-004: one signed-URL duration, at or below the approved maximum", () => {
  it("stays within the approved ceiling", () => {
    expect(ATTACHMENT_LIMITS.signedUrlSeconds).toBeLessThanOrEqual(
      ATTACHMENT_LIMITS.maxSignedUrlSeconds,
    );
    expect(ATTACHMENT_LIMITS.maxSignedUrlSeconds).toBe(600);
  });

  it("the Files page signs with the named constant, not a literal", () => {
    expect(FILES_PAGE).toContain("ATTACHMENT_LIMITS.signedUrlSeconds");
    expect(FILES_PAGE).not.toMatch(/createSignedUrls\(\s*\n?\s*[^)]*,\s*600\s*,/);
  });

  it("the Deno worker's own copy agrees", () => {
    // `supabase/functions` cannot import `src/lib` — the `server-only` guard
    // throws under Deno — so the worker keeps a literal and this test is the
    // link between them, exactly as `extraction-parity.test.ts` links the
    // interpretation schema.
    const match = /createSignedUrl\(attachment\.storage_path, (\d+)\)/.exec(
      WORKER_ATTACHMENT,
    );
    expect(match, "the worker's signed URL call must still be findable").not.toBeNull();
    expect(Number(match![1])).toBe(ATTACHMENT_LIMITS.signedUrlSeconds);
  });
});
