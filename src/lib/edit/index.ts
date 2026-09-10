/**
 * The self-edit backend, ticket 012. One backend for every rung: the portal consumes this
 * module and never reaches past it into `assembly/` — so the second reader (the annotation
 * manifest, for hand-built sites) lands here without the editor UI changing.
 *
 * `preview.tsx` is deliberately NOT re-exported: it pulls in fourteen React components and
 * has a `"use client"` boundary, so a server route importing the partition would drag the
 * whole section tree into a server bundle. Import it directly where it is rendered.
 */
export * from "./inventory";
export * from "./spec-adapter";
export * from "./apply";
