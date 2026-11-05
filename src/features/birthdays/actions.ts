"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { resolveLocale } from "@/lib/preferences";

import { getBirthdayCopy } from "./copy";
import { birthdayFormSchema } from "./schema";
import type { BirthdayActionState } from "./state";

/**
 * Life Brain C.5 (ADR-156) — set, change or clear a person's birthday.
 *
 * The one writer is `set_person_birthday`: it checks the owner again, keeps the
 * yearly reminder in step with the date, and audits. The reminder's title is
 * built here, in the owner's language, from the person's own name as the
 * database holds it (never from the form).
 */
export async function setPersonBirthday(_previous: BirthdayActionState, formData: FormData): Promise<BirthdayActionState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getBirthdayCopy(locale);
  const parsed = birthdayFormSchema.safeParse({
    personId: formData.get("personId"),
    intent: formData.get("intent"),
    day: formData.get("day"),
    month: formData.get("month"),
    year: formData.get("year"),
  });
  if (!parsed.success) return { status: "error", message: copy.invalid };

  const { supabase, user } = await requireUser(locale);
  const person = await supabase.from("people").select("id,name").eq("id", parsed.data.personId).eq("user_id", user.id).maybeSingle();
  if (person.error) return { status: "error", message: copy.failed };
  if (!person.data) return { status: "error", message: copy.failed };

  const clearing = parsed.data.intent === "clear";
  const { data, error } = await supabase.rpc("set_person_birthday", {
    p_person_id: person.data.id,
    p_month: clearing ? (null as unknown as number) : parsed.data.month!,
    p_day: clearing ? (null as unknown as number) : parsed.data.day!,
    p_year: clearing ? (null as unknown as number) : (parsed.data.year as number),
    p_reminder_title: clearing ? (null as unknown as string) : copy.reminderTitle(person.data.name),
  });
  if (error) return { status: "error", message: error.code === "22023" ? copy.invalid : copy.failed };

  revalidatePath(`/${locale}/app/people/${person.data.id}`);
  const changed = (data as { changed?: boolean } | null)?.changed === true;
  if (!changed) return { status: "success", message: copy.unchanged };
  return { status: "success", message: clearing ? copy.cleared : copy.saved };
}
