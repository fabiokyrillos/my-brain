import { ArrowLeft, Building2 } from "lucide-react";
import { UniversalStateLine } from "@/features/experience/universal-state";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateOrganization } from "@/features/entities/actions";
import { getEntityCopy } from "@/features/entities/copy";
import { EntityEditForm } from "@/features/entities/entity-edit-form";
import { getVocabularyCopy, projectStatusLabel } from "@/features/vocabulary/copy";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/**
 * One organization, with everything that points at it (EGC-ORG-002).
 *
 * The two "linked" collections are not a new relation: `people.organization_id`
 * and `projects.organization_id` have both existed since `202607160003` and
 * have only ever been readable from the other end. Reading them from this end
 * is what makes a company a place rather than a label.
 *
 * The row is fetched by id with no `user_id` predicate, exactly as the Project
 * and Person detail pages do: forced RLS scopes it, so a foreign id returns no
 * row and `notFound()` renders — a stranger's organization is indistinguishable
 * from one that does not exist, which is the correct answer to both.
 */
export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; organizationId: string }>;
}) {
  const { locale: candidate, organizationId } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getEntityCopy(locale);
  const vocabulary = getVocabularyCopy(locale);
  const { supabase } = await requireUser(locale);

  const [organizationResult, peopleResult, projectsResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("id,name,description,created_at,updated_at")
      .eq("id", organizationId)
      .maybeSingle(),
    supabase.from("people").select("id,name").eq("organization_id", organizationId).order("name").limit(100),
    supabase
      .from("projects")
      .select("id,name,status")
      .eq("organization_id", organizationId)
      .order("name")
      .limit(100),
  ]);

  const organization = requireSupabaseData(organizationResult, "load organization");
  const people = requireSupabaseData(peopleResult, "load organization people") ?? [];
  const projects = requireSupabaseData(projectsResult, "load organization projects") ?? [];
  if (!organization) notFound();

  return (
    <div className="content-page entity-detail">
      <Link className="back-link" href={`/${locale}/app/organizations`}>
        <ArrowLeft size={16} />
        {copy.organizations}
      </Link>

      <header className="entity-hero">
        <Building2 size={28} />
        <div>
          <p className="eyebrow">{copy.organizationsEyebrow}</p>
          <h1>{organization.name}</h1>
          <p>{organization.description ?? copy.noDescription}</p>
        </div>
      </header>

      <EntityEditForm
        action={updateOrganization}
        fields={{
          kind: "organization",
          id: organization.id,
          name: organization.name,
          description: organization.description,
        }}
        locale={locale}
        organizations={[]}
      />

      <div className="entity-columns">
        <section>
          <h2>{copy.linkedPeople}</h2>
          {people.length ? (
            <div className="mini-list">
              {people.map((person) => (
                <Link href={`/${locale}/app/people/${person.id}`} key={person.id}>
                  <strong>{person.name}</strong>
                </Link>
              ))}
            </div>
          ) : (
            <UniversalStateLine description={copy.linkedPeopleEmpty} locale={locale} state="empty" />
          )}
        </section>
        <section>
          <h2>{copy.linkedProjects}</h2>
          {projects.length ? (
            <div className="mini-list">
              {projects.map((project) => (
                <Link href={`/${locale}/app/projects/${project.id}`} key={project.id}>
                  <strong>{project.name}</strong>
                  <span>{projectStatusLabel(locale, project.status) ?? vocabulary.unknownState}</span>
                </Link>
              ))}
            </div>
          ) : (
            <UniversalStateLine description={copy.linkedProjectsEmpty} locale={locale} state="empty" />
          )}
        </section>
      </div>
    </div>
  );
}
