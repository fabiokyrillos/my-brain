import { SEARCH_DOMAINS, type SearchDomain, type SearchResult } from "./contracts";

/**
 * How the search page arranges what `searchEverything` returned.
 *
 * Presentation only: nothing here ranks, filters or drops a result. The page
 * groups rows by kind, marks the words that matched, and cuts a caption that
 * would only repeat its own title.
 */

export type ResultGroup = {
  readonly domain: SearchDomain;
  readonly results: readonly SearchResult[];
};

/** The results under their kind, kinds in the product's own order, rows as they arrived. */
export function groupResults(results: readonly SearchResult[]): ResultGroup[] {
  return SEARCH_DOMAINS.map((domain) => ({
    domain,
    results: results.filter((result) => result.domain === domain),
  })).filter((group) => group.results.length > 0);
}

export type TextSegment = { readonly text: string; readonly match: boolean };

/**
 * A text cut at every occurrence of the query, case-insensitively.
 *
 * The pieces are plain strings the caller renders as text nodes — OD-2 holds: a
 * title or a snippet is never markup, and marking a match does not make it so.
 */
export function splitMatches(text: string, query: string): TextSegment[] {
  const needle = query.trim().toLowerCase();
  if (needle === "" || text === "") return text === "" ? [] : [{ text, match: false }];

  const haystack = text.toLowerCase();
  // Lowercasing can change a string's length in a few scripts; when it does the
  // offsets would no longer line up, so the text is returned unmarked.
  if (haystack.length !== text.length) return [{ text, match: false }];

  const segments: TextSegment[] = [];
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) segments.push({ text: text.slice(from, at), match: false });
    segments.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) segments.push({ text: text.slice(from), match: false });
  return segments;
}

const flat = (value: string) => value.replace(/[\s…]+/g, " ").trim().toLowerCase();

/**
 * The snippet a row shows under its title, or `null` when it would say nothing
 * the title has not: a record whose title *is* the start of its own text would
 * otherwise print the same words twice.
 */
export function rowSnippet(result: Pick<SearchResult, "title" | "snippet">): string | null {
  if (!result.snippet) return null;
  const snippet = flat(result.snippet);
  if (snippet === "") return null;
  return flat(result.title).includes(snippet) ? null : result.snippet;
}
