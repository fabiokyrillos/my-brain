/**
 * Where the awaiting state is resolved.
 *
 * One function rather than three template literals, because `BYOK-CAPTURE-002`
 * asks every surface that renders the awaiting state to link to Settings, and a
 * route spelled out at three call sites is a route that will be right at two of
 * them after the next reorganisation. `projection-mappers.ts` refuses an
 * `AvailableAction` whose `href` is not a safe same-origin path, so a broken one
 * here removes the link rather than rendering a dead one — which is why this is
 * covered by a test that asserts the shape, not only the string.
 */
export function byokSettingsHref(locale: "pt-BR" | "en"): string {
  return `/${locale}/app/settings`;
}
