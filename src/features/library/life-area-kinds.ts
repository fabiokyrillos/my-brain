import { LIFE_AREAS } from "@/lib/ai/extraction-schema";

/**
 * The areas of life a record can be filed under (Life Brain C.1, ADR-148): the
 * extraction vocabulary without `other`, which links nothing. Its own module,
 * free of I/O, so the chat's sensitivity predicate and the Memória loaders read
 * one list.
 */
export const AREA_KINDS = LIFE_AREAS.filter((kind): kind is Exclude<(typeof LIFE_AREAS)[number], "other"> => kind !== "other");
export type AreaKind = (typeof AREA_KINDS)[number];

export function isAreaKind(value: unknown): value is AreaKind {
  return typeof value === "string" && (AREA_KINDS as readonly string[]).includes(value);
}
