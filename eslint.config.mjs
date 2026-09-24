import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  {
    // `src/lib/edit` is a module with a named export list, not a folder to reach into.
    // The portal builds against that list across a repo boundary, so a deep import inside
    // this repo quietly turns an internal file into someone else's dependency.
    //
    // Exempt, deliberately:
    //   • `markers` and `preview` — both render. The fourteen section components import
    //     `markers` directly so a built site never pulls the edit backend into its bundle.
    //   • `scripts/**` — the `check-*` conformance tools are this module's own test seam,
    //     not callers, and are outside this config's `files` glob.
    //   • the module's own files, which import each other by relative path.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/edit/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                // Both spellings, because this repo uses relative imports as often as
                // the alias: `src/lib/edit` is the only `edit/` directory in the tree, so
                // matching on the segment cannot catch anything else.
                "@/lib/edit/*",
                "**/edit/*",
                "!@/lib/edit/preview",
                "!@/lib/edit/markers",
                "!**/edit/preview",
                "!**/edit/markers",
              ],
              message:
                "Import from '@/lib/edit' instead — that named export list is the contract the portal mirrors. Only 'preview' and 'markers' may be imported directly.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
