# `markers` and `preview` sit outside the edit backend's barrel

`src/lib/edit/index.ts` is a named-export barrel — every other file in `src/lib/edit/` is meant
to be imported through it, enforced by `no-restricted-imports`. `markers.tsx` and `preview.tsx`
are the two exceptions, both because they render: `preview.tsx` pulls fourteen React components
behind a `"use client"` boundary, and a server route importing it through the barrel would drag
the section tree into a server bundle. `markers.tsx` is imported by all sixteen section
components to emit `data-ae-*` attributes no visitor ever sees; routing it through the barrel
would make every built client site import the whole edit backend (Zod, both readers, the write
path) just to emit those attributes.

`markers` is the one taste-dependent call in this effort — it was a judgement call made on
Chevis's behalf, not settled law, and it is reversible: one rule change plus ~16 import rewrites
in the section components that import it directly.

A future reader will try to "fix" this by routing both through the barrel for consistency. Don't
— the bundle-size cost is the reason they're carved out, not an oversight.
