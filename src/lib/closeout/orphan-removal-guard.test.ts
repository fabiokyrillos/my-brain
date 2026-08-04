import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { manifestPaths } from "../../../scripts/sh-delete-015-manifest.mjs";

/**
 * SH-DELETE-015 — the removal tool's own guardrails.
 *
 * The scanner may hold no destructive call, and `storage-orphan-scanner.test.ts`
 * pins that. This is the other half: the file that *does* hold the capability
 * must refuse to use it on anything but a world matching the committed
 * manifest, and must not act without `--apply`.
 *
 * The manifest parser is tested against the real committed document rather than
 * a fixture. A fixture would keep passing after the document changed shape, and
 * the document is the thing the owner authorized — if its table stops being
 * parseable, the parser returns nothing, and returning nothing must fail closed
 * rather than authorize an empty deletion.
 */

const REPO = process.cwd();
const SOURCE = readFileSync(join(REPO, "scripts/sh-delete-015-remove-orphans.mjs"), "utf8");

const executable = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("the removal tool cannot act by accident", () => {
  it("performs nothing without an explicit --apply", () => {
    expect(executable).toContain('includes("--apply")');
    // The dry-run branch must return BEFORE the remove call appears.
    const dryRunReturn = executable.indexOf("if (!apply)");
    const removal = executable.indexOf(".remove(measured)");
    expect(dryRunReturn).toBeGreaterThan(-1);
    expect(removal).toBeGreaterThan(dryRunReturn);
  });

  it("removes exactly the measured set, never a filtered-by-name subset", () => {
    // `measured` is the classified live set that passed every precondition.
    // Removing anything derived from a filename or a date would be the failure
    // mode the owner authorization explicitly rules out.
    expect(executable).toContain(".remove(measured)");
    expect(executable).not.toMatch(/\.remove\([^)]*filter/);
  });

  it("refuses when the bucket and the manifest disagree in either direction", () => {
    expect(executable).toContain("manifest paths absent from the bucket");
    expect(executable).toContain("bucket holds objects the manifest does not");
  });

  it("reads the manifest through the shared reader, not a hard-coded list", () => {
    expect(executable).toContain('from "./sh-delete-015-manifest.mjs"');
    expect(executable).toContain("manifestPaths(readFileSync(MANIFEST");
  });

  it("re-classifies structurally using the scanner's own function", () => {
    expect(executable).toContain('from "./verify-storage-orphans.mjs"');
    expect(executable).toContain("classifyObject(");
    // Age and filename are not criteria. If either ever becomes one, this fails.
    expect(executable).not.toContain("created_at");
    expect(executable).not.toContain("endsWith(");
  });

  it("excludes live accounts and referenced objects explicitly", () => {
    expect(executable).toContain("liveOwners.has(object.prefix)");
    expect(executable).toContain("attachmentsByPath.has(object.path)");
  });

  it("does not scan on import, so a unit test cannot reach a live project", () => {
    expect(executable).toContain("import.meta.url === pathToFileURL(process.argv[1]).href");
  });
});

describe("the manifest parser reads the committed document", () => {
  const markdown = readFileSync(
    join(REPO, "docs/reports/SH_DELETE_015_ORPHAN_MANIFEST.md"),
    "utf8",
  );

  it("recovers the six manifested paths", () => {
    const paths = manifestPaths(markdown);
    expect(paths).toHaveLength(6);
    for (const path of paths) {
      // `<uuid>/<uuid>-<name>` by construction — ownership is structural.
      expect(path).toMatch(/^[0-9a-f-]{36}\/.+/);
    }
    expect(new Set(paths).size).toBe(6);
  });

  it("yields nothing from a document whose table is gone, so it fails closed", () => {
    expect(manifestPaths("# no table here\n\njust prose\n")).toEqual([]);
  });

  it("ignores rows that are not numbered path rows", () => {
    const table = [
      "| # | Path | Class |",
      "| --- | --- | --- |",
      "| 1 | `aaaa/bbbb-x.txt` | `absent-owner` |",
      "| n/a | `cccc/dddd-y.txt` | note |",
    ].join("\n");
    expect(manifestPaths(table)).toEqual(["aaaa/bbbb-x.txt"]);
  });
});
