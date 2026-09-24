import { FooterSection, type FooterProps } from "../sections/footer";
import type { EditProps } from "../../lib/edit/markers";

/**
 * The site-wide footer. Same component as the `footer` section type, different ids: here
 * its props come from `client.*` rather than from a section's own props, so the marker
 * scope renames the three that are fields and rules out the two that are not — `copyright`
 * is derived from the year and the name, and `navLinks` is navigation (paid, §1.1).
 */
export const SITE_FOOTER_MARKERS = {
  prefix: "client",
  rename: {
    companyName: "name",
    tagline: "tagline",
    socialLinks: "social",
    copyright: null,
    navLinks: null,
  },
} as const;

export function Footer({ edit, ...props }: FooterProps & EditProps) {
  return <FooterSection {...props} edit={edit} />;
}
