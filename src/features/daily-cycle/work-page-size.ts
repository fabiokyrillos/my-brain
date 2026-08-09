/**
 * How many tasks one Work page holds.
 *
 * ## Why this is a module of its own
 *
 * It was declared in `work-projection.ts`, which begins `import "server-only"`.
 * That is correct for a projection and wrong for this constant: OD-2L-4 signed
 * the selection ceiling as **50, matching `WORK_PAGE_SIZE`**, and the selection
 * model runs in the browser. A Client Component importing it from the
 * projection pulls the server graph into the browser, and the jsdom gate cannot
 * import it at all.
 *
 * So the number moved here and `work-projection.ts` re-exports it. **One
 * declaration**, which is the property that matters: a page that showed sixty
 * rows under a ceiling of fifty would refuse a "select all shown" the user had
 * just performed, and two constants is exactly how that happens.
 */
export const WORK_PAGE_SIZE = 50;
