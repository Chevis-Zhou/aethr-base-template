import type { SiteSpec } from "./site-spec";
import { SECTION_REGISTRY } from "./section-registry";

function serializeValue(value: unknown, indent = 0): string {
  if (value === undefined || value === null) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  const pad = "  ".repeat(indent + 1);
  const closePad = "  ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => `${pad}${serializeValue(v, indent + 1)}`);
    return `[\n${items.join(",\n")},\n${closePad}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    if (entries.length === 0) return "{}";
    const fields = entries.map(([key, val]) => {
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
      return `${pad}${safeKey}: ${serializeValue(val, indent + 1)}`;
    });
    return `{\n${fields.join(",\n")},\n${closePad}}`;
  }

  return String(value);
}

function isComplex(value: unknown): boolean {
  return Array.isArray(value) || (typeof value === "object" && value !== null);
}

function slugToLabel(slug: string): string {
  return slug
    .replace(/^\//, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function deriveNav(pages: SiteSpec["pages"]): { label: string; href: string }[] {
  const nav = [{ label: "Home", href: "/" }];
  for (const page of pages) {
    if (page.slug !== "/") {
      nav.push({ label: slugToLabel(page.slug), href: page.slug });
    }
  }
  return nav;
}

export function generateClientConfig(spec: SiteSpec): string {
  const nav = spec.nav ?? deriveNav(spec.pages);
  const navLines = nav
    .map((n) => `    { label: ${JSON.stringify(n.label)}, href: ${JSON.stringify(n.href)} }`)
    .join(",\n");

  const s = spec.client.social ?? {};

  return `export const clientConfig = {
  name: ${JSON.stringify(spec.client.name)},
  tagline: ${JSON.stringify(spec.client.tagline)},
  description: ${JSON.stringify(spec.client.description)},

  email: ${JSON.stringify(spec.client.email)},
  phone: ${JSON.stringify(spec.client.phone ?? "")},
  address: ${JSON.stringify(spec.client.address ?? "")},
  bookingUrl: ${JSON.stringify(spec.client.bookingUrl ?? "")},

  social: {
    facebook: ${JSON.stringify(s.facebook ?? "")},
    instagram: ${JSON.stringify(s.instagram ?? "")},
    linkedin: ${JSON.stringify(s.linkedin ?? "")},
    twitter: ${JSON.stringify(s.twitter ?? "")},
  },

  tokens: {
    primaryHue: ${JSON.stringify(spec.tokens.primaryHue)},
    primarySaturation: ${JSON.stringify(spec.tokens.primarySaturation)},
    primaryLightness: ${JSON.stringify(spec.tokens.primaryLightness)},
    secondaryHue: ${JSON.stringify(spec.tokens.secondaryHue)},
    secondarySaturation: ${JSON.stringify(spec.tokens.secondarySaturation)},
    secondaryLightness: ${JSON.stringify(spec.tokens.secondaryLightness)},
    accentHue: ${JSON.stringify(spec.tokens.accentHue)},
    accentSaturation: ${JSON.stringify(spec.tokens.accentSaturation)},
    accentLightness: ${JSON.stringify(spec.tokens.accentLightness)},
    fontHeading: ${JSON.stringify(spec.tokens.fontHeading)},
    fontBody: ${JSON.stringify(spec.tokens.fontBody)},
    radius: ${JSON.stringify(spec.tokens.radius)},
  },

  nav: [
${navLines},
  ],

  footer: {
    copyright: ${JSON.stringify(`© ${new Date().getFullYear()} ${spec.client.name}. All rights reserved.`)},
    links: [] as { label: string; href: string }[],
  },
} as const;

export type ClientConfig = typeof clientConfig;
`;
}

export function generatePage(page: SiteSpec["pages"][number]): string {
  const imports = new Map<string, { importPath: string; componentName: string }>();
  for (const section of page.sections) {
    if (!imports.has(section.type)) {
      const meta = SECTION_REGISTRY[section.type];
      imports.set(section.type, meta);
    }
  }

  const importLines = [
    'import type { Metadata } from "next";',
    ...Array.from(imports.values()).map(
      (m) => `import { ${m.componentName} } from "${m.importPath}";`,
    ),
  ].join("\n");

  const constDeclarations: string[] = [];
  const jsxElements: string[] = [];

  for (let i = 0; i < page.sections.length; i++) {
    const section = page.sections[i];
    const meta = SECTION_REGISTRY[section.type];
    const props = section.props as Record<string, unknown>;

    const inlineAttrs: string[] = [];
    const refAttrs: string[] = [];

    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null) continue;

      if (isComplex(value)) {
        const varName = `${key}${i}`;
        constDeclarations.push(`const ${varName} = ${serializeValue(value, 0)};`);
        refAttrs.push(`${key}={${varName}}`);
      } else if (typeof value === "string") {
        inlineAttrs.push(`${key}=${JSON.stringify(value)}`);
      } else {
        inlineAttrs.push(`${key}={${value}}`);
      }
    }

    const allAttrs = [...inlineAttrs, ...refAttrs];

    if (allAttrs.length === 0) {
      jsxElements.push(`      <${meta.componentName} />`);
    } else if (allAttrs.length <= 3 && allAttrs.every((a) => a.length < 50)) {
      jsxElements.push(`      <${meta.componentName} ${allAttrs.join(" ")} />`);
    } else {
      const formatted = allAttrs.map((a) => `        ${a}`).join("\n");
      jsxElements.push(`      <${meta.componentName}\n${formatted}\n      />`);
    }
  }

  const metaExport = page.description
    ? `export const metadata: Metadata = {\n  title: ${JSON.stringify(page.title)},\n  description: ${JSON.stringify(page.description)},\n};`
    : `export const metadata: Metadata = {\n  title: ${JSON.stringify(page.title)},\n};`;

  const constBlock =
    constDeclarations.length > 0 ? "\n" + constDeclarations.join("\n\n") + "\n" : "";

  return `${importLines}
${constBlock}
${metaExport}

export default function Page() {
  return (
    <>
${jsxElements.join("\n")}
    </>
  );
}
`;
}
