"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { profileSchema } from "./schema";

export async function updateProfile(formData: FormData) {
  const parsed=profileSchema.safeParse(Object.fromEntries(formData)); if(!parsed.success) redirect("/pt-BR/app/settings?error=invalid");
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect(`/${parsed.data.locale}/auth/login`);
  const p=parsed.data;
  const {error:profileError}=await supabase.from("profiles").update({display_name:p.displayName,locale:p.locale,timezone:p.timezone}).eq("user_id",user.id);
  const {error:preferenceError}=await supabase.from("agent_preferences").update({agent_name:p.agentName,follow_up_intensity:p.followUpIntensity,daily_review_time:p.dailyReviewTime}).eq("user_id",user.id);
  if(profileError||preferenceError) redirect(`/${p.locale}/app/settings?error=save`); revalidatePath(`/${p.locale}/app/settings`); redirect(`/${p.locale}/app/settings?saved=1`);
}
