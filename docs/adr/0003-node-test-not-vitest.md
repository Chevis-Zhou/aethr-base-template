# `node:test` + `tsx`, not vitest

The repo already had one orphaned test file using `node:test` + `node:assert/strict` with no
runner wired up. Matched that existing idiom instead of introducing vitest: zero new
dependencies, `tsx` was already a devDep, and it gave the orphaned file a runner for the first
time alongside the new suite. Vitest was installed during an earlier pass of this work and fully
removed once the decision was made — `package.json` is byte-identical to HEAD before that
detour. Surprising in a Next.js repo, where vitest or Jest is the default assumption; don't
reintroduce either without a reason beyond "it's more common."
