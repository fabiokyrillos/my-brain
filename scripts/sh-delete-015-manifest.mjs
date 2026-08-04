/**
 * The SH-DELETE-015 manifest reader.
 *
 * Its own module, with no shebang and no Supabase import, so a unit test can
 * import it without pulling in an executable script — and so the parser that
 * decides *what may be deleted* is testable in isolation from the thing that
 * does the deleting.
 *
 * The committed manifest is the authority the owner gave; this reads it rather
 * than trusting a hard-coded list, because a list in the removal script could
 * drift from the document that authorized it.
 */

/**
 * Extracts the manifested object paths from the manifest markdown.
 *
 * Matches rows whose first cell is a number and whose second is a backticked
 * path — the shape §3's table uses. Anything else is ignored, and a document
 * that has lost that shape yields an **empty array**, which every caller must
 * treat as "authorize nothing" rather than "nothing to check".
 */
export function manifestPaths(markdown) {
  const paths = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|/.exec(line.trim());
    if (match) paths.push(match[1]);
  }
  return paths;
}
