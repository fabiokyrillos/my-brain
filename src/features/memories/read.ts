/**
 * Narrowing the two CHECK-constrained text columns to their literal unions.
 *
 * `memories.kind` and `memories.sensitivity` are `text` with a CHECK, so
 * PostgREST types them as `string` and the generated `database.types.ts` does
 * the same. Indexing a localized record with a bare `string` is a type error,
 * and casting at each call site would put an unchecked assertion in every
 * component that renders a memory.
 *
 * A value outside the allowed literals is a **data fault**, not a crash: the
 * database rejects one on write, so seeing one here means the constraint was
 * changed without this code. Falling back to the column's own default renders a
 * truthful-enough label instead of a blank or an exception, and keeps a schema
 * drift from taking the page down.
 *
 * The same shape `projects/[projectId]/page.tsx:14-16` uses for `status`.
 */

import { MEMORY_KINDS, MEMORY_SENSITIVITIES, type MemoryKind, type MemorySensitivity } from "./schema";

export function asMemoryKind(value: string): MemoryKind {
  return (MEMORY_KINDS as readonly string[]).includes(value) ? (value as MemoryKind) : "fact";
}

export function asMemorySensitivity(value: string): MemorySensitivity {
  return (MEMORY_SENSITIVITIES as readonly string[]).includes(value)
    ? (value as MemorySensitivity)
    : "normal";
}
