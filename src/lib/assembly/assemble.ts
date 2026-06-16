import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod/v4";
import { siteSpecSchema, type SiteSpec } from "./site-spec";
import { generateClientConfig, generatePage } from "./generate";

export interface AssemblyResult {
  filesWritten: string[];
  pagesGenerated: number;
  sectionsUsed: string[];
}

function slugToFilePath(slug: string): string {
  if (slug === "/") return "src/app/page.tsx";
  const clean = slug.startsWith("/") ? slug.slice(1) : slug;
  return `src/app/${clean}/page.tsx`;
}

export async function assembleFromSpec(
  specPath: string,
  projectRoot: string,
): Promise<AssemblyResult> {
  const resolvedSpec = path.resolve(specPath);
  const raw = fs.readFileSync(resolvedSpec, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${resolvedSpec}`);
  }

  const result = z.safeParse(siteSpecSchema, parsed);
  if (!result.success) {
    const issues = z.prettifyError(result.error);
    throw new Error(`Spec validation failed:\n${issues}`);
  }

  const spec: SiteSpec = result.data;
  const filesWritten: string[] = [];
  const sectionsUsed = new Set<string>();

  const configContent = generateClientConfig(spec);
  const configPath = path.join(projectRoot, "src/lib/client-config.ts");
  fs.writeFileSync(configPath, configContent, "utf-8");
  filesWritten.push("src/lib/client-config.ts");

  for (const page of spec.pages) {
    const relPath = slugToFilePath(page.slug);
    const fullPath = path.join(projectRoot, relPath);

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    const pageContent = generatePage(page);
    fs.writeFileSync(fullPath, pageContent, "utf-8");
    filesWritten.push(relPath);

    for (const section of page.sections) {
      sectionsUsed.add(section.type);
    }
  }

  return {
    filesWritten,
    pagesGenerated: spec.pages.length,
    sectionsUsed: Array.from(sectionsUsed),
  };
}

// CLI entry point: npx tsx src/lib/assembly/assemble.ts <spec.json>
if (process.argv[1]?.replace(/\\/g, "/").includes("assembly/assemble")) {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error("Usage: npx tsx src/lib/assembly/assemble.ts <spec.json>");
    process.exit(1);
  }

  assembleFromSpec(specPath, process.cwd())
    .then((result) => {
      console.log("\nAssembly complete");
      console.log(`  Pages generated: ${result.pagesGenerated}`);
      console.log(`  Sections used: ${result.sectionsUsed.join(", ")}`);
      console.log(`  Files written:`);
      for (const f of result.filesWritten) {
        console.log(`    ${f}`);
      }
    })
    .catch((err: unknown) => {
      console.error("Assembly failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
