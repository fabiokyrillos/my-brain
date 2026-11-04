import { assertEquals } from "jsr:@std/assert@1";

import { LIFE_AREA_LINK_THRESHOLD, lifeAreaToLink } from "./life-area.ts";

// Life Brain C.1 (ADR-148, LIFE_DATA_MODEL.md §2): the worker links an entry to
// its life area only when the reading is confident, and never for `other`.

Deno.test("links a confident reading of a real area", () => {
  assertEquals(lifeAreaToLink({ kind: "health", confidence: 0.9 }), { kind: "health", confidence: 0.9 });
  assertEquals(lifeAreaToLink({ kind: "work", confidence: LIFE_AREA_LINK_THRESHOLD }), { kind: "work", confidence: 0.6 });
});

Deno.test("links nothing for no area, for other, or below the threshold", () => {
  assertEquals(lifeAreaToLink(null), null);
  assertEquals(lifeAreaToLink({ kind: "other", confidence: 0.99 }), null);
  assertEquals(lifeAreaToLink({ kind: "travel", confidence: 0.59 }), null);
});

Deno.test("the threshold is the one the database asserts too", () => {
  assertEquals(LIFE_AREA_LINK_THRESHOLD, 0.6);
});
