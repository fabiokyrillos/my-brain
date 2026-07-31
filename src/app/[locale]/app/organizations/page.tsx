import { Building2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createOrganization } from "@/features/entities/actions";
import { getEntityCopy } from "@/features/entities/copy";
import { EntityCreateForm } from "@/features/entities/entity-create-form";
import { loadOrganizations } from "@/features/entities/organizations";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";

/**
 * The organizations list (EGC-ORG-001, EGC-SURFACE-001).
 *
 * `organizations` has existed since `202607160003` and has never had a route.
 * Rows arrived from the interpretation pipeline and were visible only as a name
 * inside somebody else's selector — which is why the Company control could
 * report emptiness with no way to act on it (`EG-04`).
 *
 * **Every sentence here comes from the typed copy module** (EGC-SURFACE-002).
 * The older list pages still carry inline locale ternaries; this one adds none,
 * because the G-0.4 baseline is a ceiling and new surfaces are where the count
 * would otherwise grow. The ceiling is measured by a text search, so this
 * paragraph deliberately does not spell the pattern out — a comment that
 * quoted it would raise the count it claims to hold.
 */
export default async function OrganizationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getEntityCopy(locale);
  const page = parsePage((await searchParams).page);
  const { supabase } = await requireUser(locale);
  const { items, hasNext } = await loadOrganizations(supabase, page);

  return (
    <div className="content-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{copy.organizationsEyebrow}</p>
          <h1>{copy.organizations}</h1>
          <p>{copy.organizationsIntro}</p>
        </div>
        <EntityCreateForm action={createOrganization} kind="organization" locale={locale} />
      </header>

      {items.length ? (
        <div className="list-stack">
          {items.map((organization) => (
            <Link
              className="list-row"
              href={`/${locale}/app/organizations/${organization.id}`}
              key={organization.id}
            >
              <div className="list-row-main">
                <strong>{organization.name}</strong>
                <p>{organization.description ?? copy.noDescription}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-list">
          <Building2 size={30} />
          <strong>{copy.organizationsEmpty}</strong>
          <p>{copy.organizationsEmptyHint}</p>
        </div>
      )}

      <PaginationLinks hasNext={hasNext} locale={locale} page={page} path="organizations" />
    </div>
  );
}
