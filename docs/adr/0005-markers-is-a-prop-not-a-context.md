# `markers` is passed as a prop, not a React context

The obvious implementation for "the preview needs edit markers on section output" is a React
context the section components read with `useContext`. Rejected: that would make all fourteen
section components client components — eight of them are server components today — shipping a
hydration payload into every built site to serve a preview-only surface no visitor ever sees. An
optional `edit` prop costs the preview one attribute at the call site and costs a built site
nothing: `mark(undefined, …)` returns `{}`, so `generate.ts` (which never passes the prop)
produces HTML byte-identical to before `markers.tsx` existed — asserted by
`scripts/check-edit-markers-parity.ts`, not assumed.
