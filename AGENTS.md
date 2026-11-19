# On-Ramp — agent brief

Drop this at the root of the prototype repo. It is the standing context for any
coding agent working on the build.

## What this is

On-Ramp is a neutral, state-sponsored platform that connects individuals to the
programs, employers and opportunities that already exist across four lanes:
Corporate Careers, Entrepreneurship, Startup Ecosystem, and Learning &
Development. Middle Third operates it; MEDC sponsors it. The platform is handed
over to Middle Third at the end of the engagement, so a small, part-time,
mostly non-technical team has to be able to run it.

That handoff constraint drives most of the decisions below. When there is a
choice between clever and boring, pick boring.

## Stack

Settled, not up for re-litigation. The reasoning is in `architecture.md` §4.

| Layer            | Choice                                                                  |
| ---------------- | ----------------------------------------------------------------------- |
| Framework        | TanStack Start (React, SSR, file-based routing, server functions)       |
| Hosting          | Cloudflare Workers                                                      |
| Database         | PostgreSQL on PlanetScale, via Cloudflare Hyperdrive                    |
| ORM / migrations | Drizzle — TS schema, versioned SQL migrations in the repo               |
| Background work  | Cloudflare Workflows                                                    |
| Page fetching    | Cloudflare Browser Run (tiered: feed → fetch → headless render)         |
| AI extraction    | Cloudflare AI Gateway in front of the model provider, hard spend caps   |
| Auth             | Better Auth, passwordless email OTP, tables in our own Postgres         |
| Maps             | Mapbox GL JS                                                            |
| Email            | Resend                                                                  |
| Errors           | Sentry                                                                  |
| Analytics        | Cloudflare Web Analytics (cookieless) + our own `tracking_events` table |

Do not add a dependency that introduces a new vendor account or a new bill
without raising it first. Every vendor is something Middle Third inherits.

## The one rule that matters most

The API boundary is a contractual commitment (R4) and it is easy to break by
accident:

> Page components call service functions. Service functions call the database.
> No page component contains a SQL query, a routing decision, or a business rule.

Every capability is exposed as a versioned RPC-style route under `/api/v1/`.
Use named methods such as `POST /api/v1/directory.searchOpportunities` with a
validated JSON object, rather than resource-oriented REST endpoints. This is
the user-approved prototype decision of November 12, 2026, superseding the REST
examples in the read-only context extracts. See `docs/api.md`.

HTTP routes, TanStack server functions and LLM tools call the same service
functions. SSR does not need to make an HTTP request to itself. Services do not
know about transport or model providers. Contracts live in `src/lib/contracts.ts`;
discovery schemas in `src/lib/discovery-contracts.ts`; transport adapters live
in `src/server/`. Never expose SQL or a general query
executor to a model. Every new capability must have an explicit method and schema.

## Proposed directory layout

A starting point, not scripture — but if it changes, change it deliberately and
update this file.

```
/
├── AGENTS.md
├── drizzle.config.ts
├── wrangler.jsonc
├── migrations/                 # generated SQL, committed, never hand-edited after apply
├── context/                    # this bundle — source docs, read-only
└── src/
    ├── routes/                 # TanStack Start file-based routes — thin
    │   ├── (public)/           #   lane pages, directory, org profiles, intake
    │   ├── partners/           #   partner portal
    │   ├── admin/              #   MT back office (behind Cloudflare Access)
    │   └── api/v1/             #   the versioned API boundary
    ├── services/               # ALL business logic lives here
    │   ├── discovery/          #   conversational intent and bounded search
    │   ├── routing/            #   intake → routing results → referrals
    │   ├── directory/          #   search, filters, geo
    │   ├── review/             #   ingestion review queue
    │   ├── reporting/          #   MEDC reports, exports
    │   └── identity/           #   accounts, memberships, claims, permissions
    ├── workflows/              # Cloudflare Workflows
    │   ├── ingest-all.ts       #   nightly cron fan-out
    │   ├── ingest-source.ts    #   per-partner fetch → extract → propose
    │   ├── referral-lifecycle.ts
    │   ├── retention-sweep.ts
    │   └── report-rollup.ts
    ├── db/
│   ├── schema/             # Drizzle definitions; index.ts holds the 29-table baseline
    │   └── client.ts           # Hyperdrive connection
    ├── lib/                    # genuinely shared utilities, no domain logic
    └── components/             # UI only, no data access
        └── ui/                 # shared shadcn/ui primitives
```

Services are plain TypeScript functions that take inputs and return data. They
do not know about HTTP, and they do not know about Workflows. That keeps the
ingestion pipeline portable to any durable-execution system, and it is what
makes the API boundary enforceable rather than aspirational.

## Database

`schema.sql` is the authoritative model — 29 tables of real Postgres DDL,
generated from the DBML source. Translate it into Drizzle schema definitions
rather than inventing tables. `schema-core.dbml` is a simplified view of the
dozen tables that carry most of the weight, useful for orientation.

`schema-notes.md` carries the rules the DDL cannot express: naming conventions,
status lifecycle, soft delete, full-text search approach, why we are not using
PostGIS, indexing, and the PII and retention rules. Read it before adding a
column.

The schema is expected to change as routing gets built. That is planned for —
see §8a in the notes. Changes go through a Drizzle migration on a PlanetScale
branch, never a hand-edited table.

## Hard constraints

- **The Middle Third CRM is not integrated.** The platform stores
  `organizations.crm_id` as a reference string and nothing else. No sync, no
  reads, no writes. See `product-decisions.md` §8.
- **Collect as little personal data as possible.** Intake is anonymous by
  default; personal data enters only when someone asks for a referral. The
  retention mechanisms are in the schema, not in a policy document —
  `schema-notes.md` §16.
- **Routing is deterministic first.** Rules and scoring that a person can read
  and explain remain a comparison baseline. **User-approved prototype override
  (November 12, 2026):** AI-assisted conversational discovery and matching are
  explicitly in scope for experimentation. Start with one bounded, read-only
  directory tool. The user-approved hybrid flow combines exact selections and
  AI intent extraction in a bounded service-owned turn coordinator; model-selected
  recommendations remain a later experiment. Validate tool arguments and returned IDs,
  ground explanations in retrieved facts, and render links/cards from database
  records. Do not claim that model-generated explanations are deterministic.
- **Accessibility is WCAG 2.1 AA and it is checked at each phase boundary**, not
  audited at the end. `alt_text` is required at the database layer for any
  public image. `architecture.md` §7.
- **One canonical URL per entity, server-rendered, content in the initial HTML
  response.** `discoverability-tier0.md`. Cheap now, expensive later.
- **Spend caps are enforced at the AI Gateway**, not in application code.

## Scope

`scope-phase2.md` is the fence: public four-lane site, partner directory with
search and map, intake form and routing engine, admin routing dashboard,
onboarding for 20–30 partners. Anything outside that is a conversation, not a
commit.

Deferred and explicitly not in this build: public API keys and rate limits,
embeddable widgets for partner sites, an MCP server, any CRM integration.

## Conventions

- TypeScript throughout, strict mode.
- Use shadcn/ui primitives in `src/components/ui/` for shared controls and
  containers. The user-selected baseline is preset `b2NMmadS1I`: Radix/Nova,
  Taupe, medium corners, Inter body text, DM Sans headings and Lucide icons,
  with Tailwind CSS v4 and locally bundled fonts. Defer custom lane palettes
  and bespoke component design. Feature
  components compose the primitives. Keep `components.json` and the `@/*`
  aliases working; generated imports should use `@/lib/utils`. Preserve native
  GET forms and anchors for JavaScript-free directory access.
- Use pnpm (version pinned in `package.json`); commit `pnpm-lock.yaml`. Use
  `pnpm install --frozen-lockfile` for repeatable installs and `pnpm exec` for
  local tools.
- Migrations are committed SQL. The database is reproducible from the repo.
- No raw database browser in the MT admin back office. Build purpose-built admin
  screens; Drizzle Gateway behind Cloudflare Access is the developer and
  emergency-operations tool. `architecture.md` §4.
- Secrets in Wrangler secrets or `.dev.vars`, never in the repo.

## Prototype sequence and current state

The user approved: real PostgreSQL → smallest credible directory → conversational
discovery experiments. The first increment implements the first two steps using
local Docker Postgres, with PlanetScale/Hyperdrive deployment instructions.
It does not provision vendor accounts or deploy remotely. `README.md` is the
local runbook; `docs/architecture-decisions.md` records deliberate schema changes
and remaining work. Keep `context/` unchanged.

Anonymous chat transcripts should initially be ephemeral. Persist only the
structured preferences/results needed for the experiment. Disable prompt and
response payload logging in AI Gateway and application telemetry. Use gateway
spend caps and preserve ordinary directory access during model failures.

Clearly label the fictional seed listings. Real imports stay `pending_review`
until explicitly reviewed; never represent imported organizations as signed
partner commitments.

Normal `pnpm db:seed` creates only missing core lanes and preserves edits.
Fictional listings live in `tests/fixtures/directory.ts`; load them only with
`pnpm db:seed:demo` and remove them with `pnpm db:clean:demo`. Keep the core lane
IDs stable: real imports reference them, and they share the historical fixture
UUID prefix. Cleanup must use the explicit fixture identities, never a blanket
prefix delete. Database and browser test runners seed separate `_test`
databases; never repopulate the working database as a test prerequisite.

`/discover` now implements freeform and guided conversational search. See
`docs/discovery.md` for its two public RPC methods, the single read-only tool,
Gateway setup and comparison baseline. No conversation data is persisted.
The UI labels demo mode explicitly; the public search defaults to real published
records. Cards and links are built from database facts. Model failure falls back
to the baseline. The user-approved hybrid iteration uses typed button choices
without a model, freeform intent via AI Gateway, and a bounded turn coordinator
in `src/services/discovery/conversation.ts`: at most one model call and two
searches, followed by a service-owned question. Topic-only broadening is labeled;
hard preferences require explicit user changes. Track skipped optional questions
in ephemeral structured state. Keep at most eight exchanges in the UI, never
persist transcripts, and never add ingestion/review capabilities to the loop.
Model-selected recommendations and open-ended agents remain future experiments.

Discovery opens with a required, ephemeral region panel. Southeast Michigan
combines Southeast and Detroit Metro; its optional ZIP field is a UI-only stub,
never sent to RPC/model tools, telemetry or persistence. No Anywhere option is
shown. Refresh and Start over reset the region. Keep source region aliases in
the search service and background chat controls inert while the panel is open.

## Ingestion pass

`docs/ingestion.md` is the CLI and source-configuration runbook. The first four
sources are 20Fathoms, West Michigan Works!, GRCC and Ann Arbor SPARK. Runtime
selectors and model settings live in versioned `sources.config` JSON, with a
configuration snapshot on each run. Bootstrap defaults never overwrite edits.

The second live batch adds Washtenaw Community College, Innovate Marquette,
Michigan SBDC and Capital Area Michigan Works! (CAMW). TechTown Detroit's program
configuration is prepared but disabled: its usage terms prohibit automated
collection, so publisher permission is required before enabling it. CAMW replaces
TechTown in the live batch to add career events and South Central coverage. Do
not treat an LLM or rendering fallback as a way around a source restriction.
Keep bootstrap profiles/sources append-only to preserve their stable IDs.

The November 17 random batch is registered separately through
`src/services/ingestion/batches.ts` and its versioned JSON manifest. Use
`pnpm ingest setup --batch random-20-2026-11-17` and
`pnpm ingest run --batch random-20-2026-11-17 --mode deterministic` for its
explicit identities; do not renumber the original bootstrap arrays. The draw
and per-source results are in `docs/ingestion-batches/2026-11-17-random-20.json`.
It adds 20 pending organization profiles, 13 offering proposals and five event
proposals. Seven website sources remain disabled for publisher collection/reuse
restrictions or access failures; preserve those holds. Michigan Innovation Fund
is represented under its MEDC owner, not as a standalone organization. No
automatic publication, taxonomy changes or schedules were added.

The next regional batch is `southeast-20-2026-11-17`, documented in
`docs/ingestion-batches/2026-11-17-southeast-20.json`. Its 21 selected workbook
rows resolve to 20 provider profiles: City of Detroit Careers and Detroit
Startup Fund share a City profile, with one additional random regional draw.
Use the same `setup --batch` / `run --batch` commands with this batch key.
It adds 18 offering proposals and three Chamber event proposals, all pending
review; six sources remain disabled. Preserve the Detroit Regional Chamber
feed's `categories=32` filter, which excludes third-party member submissions.
Never renumber the batches' explicit identities or overwrite source edits
when registering defaults.

The follow-up `southeast-remaining-2026-11-17` batch processes all twelve
remaining Southeast/Detroit Metro workbook entries, documented in
`docs/ingestion-batches/2026-11-17-southeast-remaining.json`. It adds 12 pending
profiles, 9 offering proposals and 3 webinar proposals; four inaccessible
sources stay disabled. No unprocessed workbook rows remain in those regions.
Wayne State uses its own Executive and Professional Development source, not
the workbook's already-registered restricted TechTown site. Preserve the
Michigan Works! Southeast feed's `organizer=7901` filter and three-event cap;
its `start_date=2026-11-17` is a manual-batch bound to advance in a later pass.
No taxonomy edits, automatic approvals or schedules were added.

`src/services/ingestion/` owns extraction, deduplication and proposals;
`scripts/ingest.ts` is the CLI adapter. Worker orchestration is in
`src/workflows/ingest-source.ts`; network/gateway/R2 adapters live in
`src/server/ingestion/`. Local raw snapshots live in ignored `.data/ingestion/`.
Use source provider IDs when available, otherwise observed URLs. A model may
not invent identity, URLs or publication decisions. Sample-limited imports must
not mark missing listings stale. Approval updates canonical records in place.

Private ingestion RPC methods are disabled until explicitly configured with a
bootstrap staff secret and reviewer identity. Protect them with Cloudflare
Access before remote deployment; replace the bootstrap interface with Better
Auth staff sessions when the portal is built. Never add ingestion mutations to
the public directory tool registry. No ingestion cron is enabled yet.

## Local review UI

User-approved prototype override (November 12, 2026): `/review` provides an
unauthenticated local queue for viewing proposals and approving/rejecting them.
Its separate `review.listProposals`, `review.editProposal` and
`review.decideProposal` RPC methods are
enabled only in development builds on loopback hosts, require same-origin JSON
requests, and use the existing local reviewer audit identity. Production builds
return 404. This exception does not relax authorization for `ingestion.*` or add
review methods to model tools. Remote staff review still needs proper auth.

`src/services/review/` shapes proposal details and delegates decisions to the
existing ingestion review service. Preserve parent-first publication, optimistic
timestamp checks, audit fields and canonical URLs. No automatic or bulk approvals
are added. Keep browser approval tests confined to isolated `_test` databases;
do not publish real local imports while testing the UI. See `docs/review.md`.

The local review UI supports inline editing through `review.editProposal`.
Validate a per-type allowlist of content fields; edits stay `pending_review`,
use the same timestamp checks and source-first lock order as decisions, and
preserve slugs, source identities, hashes, snapshots and decision audit fields.
Do not expose editing to public tools or enable it outside the local review gate.
