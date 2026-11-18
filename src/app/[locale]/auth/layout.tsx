import { SignedOutFrame } from "@/features/auth/signed-out-frame";
import { isLocale } from "@/lib/preferences";

/**
 * The frame the five signed-out pages share (Editorial calmo, ADR-180).
 *
 * One column: the product's mark and the other language at the top, then the
 * page. The mark is here rather than in each page so that moving between
 * sign-in, recovery and registration changes the question and nothing else.
 *
 * The frame itself is `SignedOutFrame`, which the consent, account-state and
 * account-deletion routes mount as well.
 *
 * A locale this does not recognise is each page's `notFound()` to answer; the
 * frame falls back so that it never throws ahead of it.
 */
export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: candidate } = await params;
  const locale = isLocale(candidate) ? candidate : "pt-BR";

  return <SignedOutFrame locale={locale}>{children}</SignedOutFrame>;
}
