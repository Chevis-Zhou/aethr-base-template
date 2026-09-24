# No Effect for module boundary enforcement

Considered using Effect to enforce the edit backend's module boundary (dependency injection,
typed errors) when the barrel and lint rule were designed 2026-09-21. Rejected: Effect is a
paradigm shift across a codebase that doesn't use it anywhere else, with no payback proportional
to that cost here. Boundary enforcement is `eslint no-restricted-imports` today, and
`dependency-cruiser` later if the import graph outgrows what ESLint can express. Recorded so it
isn't re-proposed the next time someone hits this module.
