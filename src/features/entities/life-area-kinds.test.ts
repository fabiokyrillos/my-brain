/**
 * Life Brain C.1 (LB-M1, ADR-148). `contexts.kind` admits eight life areas
 * beside work, personal and custom. Two promises follow, both pinned here:
 *
 *  - a context the product made for an area **keeps its kind** through every
 *    read and edit — before this, `asContextKind` turned any unknown kind into
 *    `custom`, so saving "Saúde" from its own page would have demoted it;
 *  - the owner still creates only the three hand-made kinds: an area is
 *    created by the product, one per owner (`contexts_user_life_area_idx`).
 */
import { describe, expect, it } from "vitest";

import { contextKindLabel } from "@/features/vocabulary/copy";
import { getEntityCopy } from "./copy";
import { CONTEXT_KINDS, CREATABLE_CONTEXT_KINDS, asContextKind, contextCreateSchema, contextUpdateSchema } from "./schema";

const AREAS = ["health", "family", "home", "finance", "travel", "study", "leisure", "ideas"] as const;
const id = "11111111-1111-4111-8111-111111111111";

describe("life areas as context kinds", () => {
  it("mirrors the eleven kinds the database admits", () => {
    expect([...CONTEXT_KINDS]).toEqual(["work", "personal", "custom", ...AREAS]);
    expect([...CREATABLE_CONTEXT_KINDS]).toEqual(["work", "personal", "custom"]);
  });

  it("keeps an area's kind when it is read, instead of demoting it to custom", () => {
    for (const area of AREAS) expect(asContextKind(area)).toBe(area);
    expect(asContextKind("pets")).toBe("custom");
  });

  it("lets an area's own page save it with its kind", () => {
    const parsed = contextUpdateSchema.safeParse({ contextId: id, locale: "pt-BR", name: "Saúde", description: "", kind: "health" });
    expect(parsed.success).toBe(true);
  });

  it("does not let the owner create an area by hand", () => {
    expect(contextCreateSchema.safeParse({ locale: "pt-BR", name: "Saúde", description: "", kind: "health" }).success).toBe(false);
    expect(contextCreateSchema.safeParse({ locale: "pt-BR", name: "Academia", description: "", kind: "custom" }).success).toBe(true);
  });

  it("names every area in both locales, wherever a kind is shown", () => {
    expect(contextKindLabel("pt-BR", "health")).toBe("Saúde");
    expect(contextKindLabel("en", "finance")).toBe("Finance");
    for (const locale of ["pt-BR", "en"] as const) {
      for (const kind of CONTEXT_KINDS) {
        expect(contextKindLabel(locale, kind), `${locale} ${kind}`).toBeTruthy();
        expect(getEntityCopy(locale).kinds[kind], `${locale} ${kind}`).toBeTruthy();
      }
    }
  });
});
