import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod/v4";
import { SECTION_PROP_SCHEMAS } from "../assembly/section-props";
import { RAIL_PROP_PATHS } from "./rail";

/**
 * Builds `prompt.md` — a **committed build artifact**, generated and never hand-edited
 * (008 §10, 007). It is checked in so it versions alongside the schema it must not drift
 * from: a section-props change and its prompt change land in one commit.
 *
 * Every content-bearing slot is filled *verbatim* from a document of record. The template's
 * own prose covers mechanics only. That split is what makes the governing constraint
 * checkable — read `prompt.md` and every sentence that constrains what the copy says traces
 * to `productized-voice.md` or to the map's ruling 10.
 *
 *   npx tsx src/lib/analysis/build-prompt.ts
 *
 * Idempotent by construction: the same sources produce a byte-identical file.
 */

const REPO_ROOT = resolve(__dirname, "../../..");
const BUSINESS_ROOT = resolve(REPO_ROOT, "../..");

const VOICE_DOC = join(BUSINESS_ROOT, "core/productized-voice.md");
const MAP_DOC = join(BUSINESS_ROOT, "tasteled/MAP.md");

const TEMPLATE = join(__dirname, "prompt.template.md");
const OUTPUT = join(__dirname, "prompt.md");

// ---------------------------------------------------------------------------
// Verbatim extraction
// ---------------------------------------------------------------------------

function read(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `build-prompt: cannot read ${path}. The prompt is generated from documents of record ` +
        `outside this repo; run it with the Vault mounted and the repo in its own domain folder.`,
    );
  }
}

/**
 * Slice one `## ` section out of a Markdown document, heading included, verbatim.
 * Matched on the heading's opening text so a later edit to the rest of the heading — which
 * these documents get — does not silently drop a slot.
 */
function section(doc: string, headingPrefix: string): string {
  const lines = doc.split("\n");
  const start = lines.findIndex((l) => l.startsWith(headingPrefix));
  if (start === -1) throw new Error(`build-prompt: no section starting "${headingPrefix}"`);

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  // Drop the source document's own trailing rule; the template supplies its own.
  return lines.slice(start, end).join("\n").trimEnd().replace(/\n+---$/, "");
}

/** Ruling 10 is one numbered list item in MAP.md's Notes, not a section. */
function ruling10(doc: string): string {
  const line = doc.split("\n").find((l) => l.startsWith("10. **Closed palette, open hand**"));
  if (!line) throw new Error("build-prompt: ruling 10 not found in MAP.md");
  return `### The map's ruling 10 — closed palette, open hand\n\n${line.replace(/^10\.\s*/, "")}`;
}

// ---------------------------------------------------------------------------
// Derived tables
// ---------------------------------------------------------------------------

function railTable(): string {
  const rows = Object.entries(RAIL_PROP_PATHS).map(
    ([field, paths]) => `| **${field}** | ${paths.map((p) => `\`${p}\``).join(" · ")} |`,
  );
  return ["| Intake field | Prop paths |", "|---|---|", ...rows].join("\n");
}

interface JsonSchemaNode {
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  enum?: unknown[];
}

/** One line per prop: `name?: type` — shape only, which is all ruling 10 permits. */
function describeProps(node: JsonSchemaNode, indent: string): string[] {
  const required = new Set(node.required ?? []);
  const lines: string[] = [];

  for (const [name, prop] of Object.entries(node.properties ?? {})) {
    const optional = required.has(name) ? "" : "?";

    if (prop.enum) {
      lines.push(`${indent}${name}${optional}: ${prop.enum.map((v) => `"${v}"`).join(" | ")}`);
      continue;
    }

    if (prop.type === "array" && prop.items?.type === "object") {
      lines.push(`${indent}${name}${optional}: [`);
      lines.push(...describeProps(prop.items, `${indent}  `));
      lines.push(`${indent}]`);
      continue;
    }

    if (prop.type === "array") {
      lines.push(`${indent}${name}${optional}: ${prop.items?.type ?? "unknown"}[]`);
      continue;
    }

    if (prop.type === "object") {
      lines.push(`${indent}${name}${optional}: {`);
      lines.push(...describeProps(prop, `${indent}  `));
      lines.push(`${indent}}`);
      continue;
    }

    lines.push(`${indent}${name}${optional}: ${prop.type ?? "unknown"}`);
  }

  return lines;
}

function sectionPropTables(): string {
  const blocks: string[] = [];

  for (const [type, schema] of Object.entries(SECTION_PROP_SCHEMAS)) {
    const json = z.toJSONSchema(schema) as JsonSchemaNode;
    blocks.push(
      [`### \`${type}\``, "", "```", ...describeProps(json, ""), "```"].join("\n"),
    );
  }

  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function buildPrompt(): string {
  const voice = read(VOICE_DOC);
  const map = read(MAP_DOC);

  const slots: Record<string, string> = {
    RULING_10: ruling10(map),
    VOICE_GOVERNING_RULING: section(voice, "## 1. The governing ruling"),
    VOICE_RAIL: section(voice, "## 2. The verbatim rail"),
    VOICE_GENERATED_SURFACE: section(voice, "## 3. The generated surface"),
    VOICE_HOUSE_REGISTER: section(voice, "## 4. The house register"),
    VOICE_B6: section(voice, "## 5. B6"),
    RAIL_TABLE: railTable(),
    SECTION_PROP_TABLES: sectionPropTables(),
  };

  let out = read(TEMPLATE);
  for (const [name, value] of Object.entries(slots)) {
    const token = `{{${name}}}`;
    if (!out.includes(token)) throw new Error(`build-prompt: template has no slot ${token}`);
    out = out.replace(token, value);
  }

  const unfilled = out.match(/\{\{[A-Z_]+\}\}/g);
  if (unfilled) throw new Error(`build-prompt: unfilled slots ${unfilled.join(", ")}`);

  // Strip the template's own build-instruction comment; it is not for the model.
  out = out.replace(/<!--[\s\S]*?-->\n\n/, "");

  return out.trimEnd() + "\n";
}

if (process.argv[1]?.includes("analysis/build-prompt")) {
  writeFileSync(OUTPUT, buildPrompt(), "utf8");
  console.log(`wrote ${OUTPUT}`);
}
