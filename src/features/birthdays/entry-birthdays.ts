import "server-only";

import { personBirthdaySchema } from "@/lib/ai/extraction-schema";
import { normalizePersonCandidateName } from "@/features/interpretations/person-candidate-contract";
import type { createClient } from "@/lib/supabase/server";

/**
 * ADR-158 — a birthday a record states, offered to the owner on the record.
 *
 * The current reading's `raw_output.people[].birthday` (no column) is matched
 * to the person the record is linked to: first by the owner's own decision on
 * that candidate (`entry_person_candidate_resolutions`, confirmed, same
 * reading), else by a person link of the same reading whose mention or person
 * name is the candidate's name. A person who already has a birthday is never
 * offered one — the record does not overwrite the owner's date; changing it is
 * the person page's job. Nothing is written here: the owner accepts or not.
 * Every read is owner-scoped by RLS and by `user_id`.
 */

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type BirthdayProposal = {
  readonly personId: string;
  readonly name: string;
  readonly day: number;
  readonly month: number;
  readonly year: number | null;
};

type StatedBirthday = { readonly candidateIndex: number; readonly name: string; readonly day: number; readonly month: number; readonly year: number | null };

/** Pure: the candidates of a reading that state a real birthday. */
export function statedBirthdays(rawPeople: unknown): StatedBirthday[] {
  if (!Array.isArray(rawPeople)) return [];
  return rawPeople.flatMap((raw, candidateIndex) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const record = raw as { name?: unknown; birthday?: unknown };
    if (typeof record.name !== "string" || !record.name.trim()) return [];
    const parsed = personBirthdaySchema.safeParse(record.birthday);
    if (!parsed.success) return [];
    return [{ candidateIndex, name: record.name, ...parsed.data }];
  });
}

/** Pure: which person each stated birthday is about, and which still lack one. */
export function birthdayProposals(input: {
  readonly rawPeople: unknown;
  readonly resolutions: readonly { readonly candidate_index: number; readonly disposition: string; readonly person_id: string | null }[];
  readonly links: readonly { readonly entity_id: string; readonly mention: string }[];
  readonly people: readonly { readonly id: string; readonly name: string; readonly birthday_month: number | null }[];
}): BirthdayProposal[] {
  const personById = new Map(input.people.map((person) => [person.id, person]));
  const resolvedPerson = new Map(
    input.resolutions
      .filter((resolution) => resolution.disposition === "confirmed" && resolution.person_id)
      .map((resolution) => [resolution.candidate_index, resolution.person_id as string]),
  );
  const out: BirthdayProposal[] = [];
  const offered = new Set<string>();
  for (const stated of statedBirthdays(input.rawPeople)) {
    const wanted = normalizePersonCandidateName(stated.name);
    const personId = resolvedPerson.get(stated.candidateIndex)
      ?? input.links.find((link) =>
        normalizePersonCandidateName(link.mention) === wanted
        || normalizePersonCandidateName(personById.get(link.entity_id)?.name ?? "") === wanted)?.entity_id;
    const person = personId ? personById.get(personId) : undefined;
    if (!person || person.birthday_month !== null || offered.has(person.id)) continue;
    offered.add(person.id);
    out.push({ personId: person.id, name: person.name, day: stated.day, month: stated.month, year: stated.year });
  }
  return out;
}

/** Drops a proposal whose person and day/month the owner already declined. */
export function withoutDeclined(
  proposals: readonly BirthdayProposal[],
  declines: readonly { readonly entity_id: string; readonly after_state: unknown }[],
): BirthdayProposal[] {
  const declined = new Set(declines.flatMap((row) => {
    const state = row.after_state as { day?: unknown; month?: unknown } | null;
    return typeof state?.day === "number" && typeof state.month === "number" ? [`${row.entity_id}:${state.month}-${state.day}`] : [];
  }));
  return proposals.filter((proposal) => !declined.has(`${proposal.personId}:${proposal.month}-${proposal.day}`));
}

export async function loadEntryBirthdayProposals(
  supabase: SupabaseClient,
  input: { readonly userId: string; readonly entryId: string; readonly interpretationId: string },
): Promise<BirthdayProposal[]> {
  const reading = await supabase
    .from("entry_interpretations")
    .select("raw_output")
    .eq("id", input.interpretationId)
    .eq("entry_id", input.entryId)
    .maybeSingle();
  if (reading.error || !reading.data) return [];
  const rawPeople = (reading.data.raw_output as { people?: unknown } | null)?.people;
  if (statedBirthdays(rawPeople).length === 0) return [];

  const [resolutions, links] = await Promise.all([
    supabase
      .from("entry_person_candidate_resolutions")
      .select("candidate_index,disposition,person_id")
      .eq("user_id", input.userId)
      .eq("entry_id", input.entryId)
      .eq("interpretation_id", input.interpretationId),
    supabase
      .from("entry_entities")
      .select("entity_id,mention")
      .eq("user_id", input.userId)
      .eq("entry_id", input.entryId)
      .eq("interpretation_id", input.interpretationId)
      .eq("entity_type", "person"),
  ]);
  if (resolutions.error || links.error) return [];
  const personIds = [...new Set([
    ...(resolutions.data ?? []).map((row) => row.person_id).filter((id): id is string => Boolean(id)),
    ...(links.data ?? []).map((row) => row.entity_id),
  ])];
  if (personIds.length === 0) return [];
  const people = await supabase
    .from("people")
    .select("id,name,birthday_month")
    .eq("user_id", input.userId)
    .in("id", personIds);
  if (people.error) return [];

  const proposals = birthdayProposals({
    rawPeople,
    resolutions: resolutions.data ?? [],
    links: links.data ?? [],
    people: people.data ?? [],
  });
  if (proposals.length === 0) return [];

  /*
   * Life Brain D.3 (ADR-167): a date the owner declined for that person is not
   * offered again. An unreadable decline list offers as before — asking again
   * is the harmless failure, hiding an offer nobody declined is not.
   */
  const declines = await supabase
    .from("audit_logs")
    .select("entity_id,after_state")
    .eq("user_id", input.userId)
    .eq("action_type", "birthday_offer_declined")
    .eq("entity_type", "person")
    .in("entity_id", proposals.map((proposal) => proposal.personId));
  if (declines.error) return proposals;
  return withoutDeclined(proposals, (declines.data ?? []) as readonly { entity_id: string; after_state: unknown }[]);
}
