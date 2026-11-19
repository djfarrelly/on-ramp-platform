# On-Ramp — build context bundle

Curated context for a coding agent working on the On-Ramp prototype. Everything
here is extracted from the client deliverables; nothing in it is new work.

Assembled 2026-11-12.

## How to use it

Copy `AGENTS.md` to the root of the prototype repo and copy this whole folder in
as `context/`. The agent brief references the other files by name.

## Files

| File | What it is | Source |
|---|---|---|
| `AGENTS.md` | The agent brief: stack, API boundary rule, directory layout, hard constraints, conventions. The only file written for this bundle rather than extracted. | — |
| `schema.sql` | Authoritative Postgres DDL, 29 tables with enums. Translate this into Drizzle schema. | `onramp-schema.sql` |
| `schema-core.dbml` | Simplified view of the dozen core tables, for orientation. | `onramp-schema-core.dbml` |
| `schema-notes.md` | Conventions, expected schema evolution, search/geo/indexing, PII and retention. The rules the DDL cannot express. | `onramp-database-schema-model.md` §4, §8a, §15, §16 |
| `architecture.md` | System architecture and the API boundary, technology selections, data freshness, intake/routing/referral, accessibility. | `onramp-architecture-plan.md` §3–§7 |
| `product-decisions.md` | Client-confirmed constraints: lane assignment, sub-categories, privacy posture, CRM boundary. | `onramp-mt-decision-memo.md` §1, §2, §7, §8 |
| `discoverability-tier0.md` | The discoverability decisions that have to be made in Phase 1 because retrofitting them is expensive. | `onramp-ai-discoverability.md` Tier 0 |
| `scope-phase2.md` | Phase 2 scope fence and the week-by-week plan. | `onramp-development-plan-draft.md` |

## What was deliberately left out

- `msa-review.md` and `msa-scope-review.md` — internal negotiating notes. They
  never travel with client work and they have nothing a builder needs.
- `onramp-prerelease-review.md` — editorial QA on the documents themselves.
- Cost model, hours, implied rates, ownership and handoff sections — contract
  context, no build value.
- The per-domain narrative in the schema model (§5–§14) — the DDL says the same
  thing more precisely. Go back to the full document if a column's intent is
  genuinely unclear.
- `onramp-mcp-assessment.md` — a real decision, but not this phase.

The "considered and set aside" paragraphs in `architecture.md` §4 were kept on
purpose. They read as padding but they stop an agent re-proposing Next.js or
Supabase halfway through the build.

## Source of truth

The full deliverables live at
`/Users/danfarrelly/Documents/personal/utah/projects/on-ramp/`. If something in
this bundle contradicts them, they win — these are extracts, and extracts drift.
Re-cut the bundle rather than editing files here.
