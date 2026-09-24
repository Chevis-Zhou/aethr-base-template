# `scripts/check-*` are exempt from `no-restricted-imports`

The base template's `scripts/check-*` conformance scripts (parity checks, extraction checks) read
`spec-adapter`, `markers`, and `preview` directly rather than through the barrel. They are the
module's own internal test seam, not callers — the same category as `__tests__/`, not a
violation of the boundary the barrel exists to enforce. Excluded from `no-restricted-imports` by
keeping `scripts/` outside the rule's `files` glob. Tightening the rule to cover `scripts/`
would silently break the parity guarantee these scripts exist to check.
