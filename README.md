# On-Ramp prototype

TanStack Start + React SSR on Cloudflare Workers, PostgreSQL, Hyperdrive and
Drizzle. The first increment is a small, searchable directory. Normal setup
loads only the four core lanes; fictional listings are opt-in test fixtures.

## Run locally

Prerequisites: Node 22.12+, pnpm 10.34.4 and Docker Desktop running.
The pnpm version is pinned in `package.json`. An isolated PostgreSQL 17
container uses `127.0.0.1:55432`; it does not use a database already on port 5432.
The local credentials in the examples are only for this Docker container.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:start
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open the Local URL printed by Vite (normally http://127.0.0.1:5173).
The app connects through the Hyperdrive binding's `localConnectionString` in
`wrangler.jsonc`. Database scripts use `DATABASE_URL` from the ignored `.env`.
For a different local database, update both connections; never use production
credentials for local development. `.dev.vars.example` documents Wrangler's
local connection override.

`pnpm db:seed` adds missing core lanes and preserves existing records and edits.
It does not add organizations, programs or events. `pnpm db:stop` stops the container and preserves the data.
Docker's named volume also survives `docker compose down`; do not add `-v`
unless you intend to permanently remove the local database.

The package includes a development-only Node 22 binary so pnpm scripts also work
on a host with Node 20. Prefer using Node 22 directly. Do not commit `.env`,
`.dev.vars`, credentials or runtime files.

## What works

- Homepage and four server-rendered lane pages.
- Organization and program directory with text search, fuzzy name search,
  aliases, tag matches, lane/region/format filters and pagination.
- Stable organization and program detail URLs, with public-safe response fields.
- Six public directory RPC methods and guarded ingestion methods; see [the API contract](docs/api.md).
- All 29 source tables translated to Drizzle, three committed SQL migrations,
  a core lane seed, and optional repeatable test fixtures.
- CLI ingestion for 20Fathoms, West Michigan Works!, GRCC and Ann Arbor SPARK,
  with database-stored selectors, optional AI Gateway extraction, snapshots,
  replay and explicit human review. See [the ingestion runbook](docs/ingestion.md).
- Published events have stable server-rendered detail pages.
- An unauthenticated local review queue at `/review` for viewing, approving and
  rejecting imported proposals. It is disabled in production builds. See
  [review instructions](docs/review.md).
- Hybrid conversational discovery at `/discover`, with four starting
  points, persistent text input, in-thread cards and follow-up choices. Buttons
  apply exact filters; text uses optional low-cost AI Gateway intent extraction.
  A bounded turn coordinator keeps conversations ephemeral and search read-only. See [the discovery runbook](docs/discovery.md).
- No public user accounts, personal-data collection or referral emails yet.

## UI components

The prototype uses [shadcn/ui](https://ui.shadcn.com/docs/installation/tanstack)
with preset `b2NMmadS1I`: Radix/Nova components, Taupe colors, medium corners,
Inter body text, DM Sans headings and Lucide icons, on Tailwind CSS v4. Fonts
are bundled locally through Fontsource. Shared primitives
live in `src/components/ui/`; feature components compose those primitives around
the existing flows. `src/styles.css` contains theme tokens, base typography and
page layout/scrolling rules. Keep visual changes in the shared tokens and
primitives rather than introducing lane colors or standalone control styles.

`components.json` configures the registry and `@/*` aliases. The original preset
command used `--template next`, which scaffolds a new Next.js project. Apply the
preset to this existing TanStack Start project with:

```sh
pnpm exec shadcn apply b2NMmadS1I --yes
```

The apply command regenerates installed UI primitives. Preserve the local
`@/lib/utils` imports and the page layout/scrolling rules when reviewing its
changes. To add a component:

```sh
pnpm exec shadcn add COMPONENT
```

Review generated imports and dependency changes; primitives use the local
`@/lib/utils` helper. Use `NativeSelect` and native date inputs where browser form
behavior matters. Directory search and pagination must still work without
JavaScript. Use `Button asChild` for button-styled TanStack links so they remain
real anchors. Preserve accessible labels and semantic headings when composing
cards and empty states.

## Ingest real sample data

```sh
pnpm db:migrate
pnpm ingest setup
pnpm ingest sources
# Review each source and record the source-specific note (see the runbook).
pnpm ingest terms --source SOURCE_KEY --note "Source-specific review note"
pnpm ingest run --all --mode deterministic
pnpm ingest proposals
```

The initial local pass inserted **10 event proposals and 6 program proposals**
from all four sources, plus four unpublished organization profiles. These are
real public-source records, separate from the demo fixtures. Nothing is
published automatically. The optional LLM adapter is tested with a mocked
gateway; live inference requires your gateway credentials and spend-limit setup.

The second local pass added **8 program proposals and 5 event proposals** from
Washtenaw Community College, Innovate Marquette, Michigan SBDC and Capital Area
Michigan Works!. TechTown's source configuration is prepared but disabled because
its terms prohibit automated collection; CAMW supplies the fourth live source.
See [the ingestion runbook](docs/ingestion.md) for source keys and refresh commands.

The November 17 random batch selects 20 additional workbook entries, registers
20 pending organization profiles, and imports bounded samples of 13 offerings
and five upcoming career events. Seven website sources remain disabled for
publisher restrictions or access failures. All new records await human review;
see the [batch selection and import results](docs/ingestion.md#random-20-organization-batch--november-17-2026).
Use `pnpm ingest run --batch random-20-2026-11-17 --mode deterministic` to
refresh only its enabled sources.

The subsequent Southeast Michigan batch adds 20 more provider profiles,
18 offering proposals and three event proposals, all pending review. Six
website sources remain disabled. It covers the workbook's Southeast and
Detroit Metro entries and groups the City's careers and Startup Fund sources
under one City of Detroit profile. Refresh it with
`pnpm ingest run --batch southeast-20-2026-11-17 --mode deterministic`;
see the [regional batch runbook](docs/ingestion.md#southeast-michigan-batch--november-17-2026).

The follow-up scan found only **12 remaining Southeast/Detroit Metro entries**.
All were registered, with bounded imports of **9 offerings and 3 events** from
accessible sources. Four website sources remain disabled for access failures;
all 24 new records await review. This exhausts unprocessed workbook entries in
those regions. Use batch key `southeast-remaining-2026-11-17` and see the
[remaining regional entries](docs/ingestion.md#remaining-southeast-michigan-entries--november-17-2026).

Use `/review` to inspect and publish the imported records through the UI. The
local review identity and timestamp checks are handled by the server.

## Verify

```sh
pnpm typecheck
pnpm test
pnpm test:db
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

Database tests create/use `onramp_test` in the local container. Each case rolls
back its changes. Set `TEST_DATABASE_URL` to use another **dedicated** test DB;
its name must end in `_test`. That database is migrated and demo-seeded.
Browser tests independently prepare `onramp_browser_test`, start their own dev
server on port 5175, and run axe accessibility checks, responsive checks, and a
no-JavaScript walkthrough. They never seed or reuse the working application
database/server. Use `BROWSER_DATABASE_URL` for an existing dedicated `_test`
database and `PLAYWRIGHT_PORT` for another free port. Test runners create local
databases automatically; explicitly supplied remote test databases must exist.
Use `pnpm test:browser` rather than running Playwright directly.
Manual screen-reader review remains a phase-boundary requirement.

## Optional demo fixtures

Automated database/browser tests load their fixtures automatically into their
isolated test databases. For manual UI testing against the working database:

```sh
pnpm db:seed:demo  # Load 10 fictional organizations and 20 programs
pnpm db:clean:demo # Remove those fixtures and their related sample rows
```

These commands use `DATABASE_URL` from `.env` and are repeatable. Demo content
is kept in `tests/fixtures/directory.ts`, outside the application seed. Cleanup
uses the registered fixture IDs, removes their joins, locations, aliases and
unused sample tags, and preserves core lanes, shared tags and real imports.
Unexpected references from other data cause a full rollback rather than a
cascading deletion. No schema migration or ingestion replay is needed.

Both commands default to local databases. Remote development branches require
an explicit `ALLOW_DEMO_SEED=true` or `ALLOW_DEMO_CLEANUP=true` environment flag.
The working local database has been cleaned of its original fictional records;
real source records and their review statuses are preserved.

For sandboxed environments, `WRANGLER_LOG_PATH=.wrangler/logs` keeps Wrangler
diagnostics inside the checkout. `pnpm cf:typegen` regenerates the committed
Worker runtime types after binding changes. Application observability is off
until privacy-safe Sentry/analytics configuration is added.

## Set up PlanetScale + Cloudflare later

No remote resources have been provisioned. Use the existing approved vendors:

1. Create a **PlanetScale PostgreSQL development branch**, and obtain its TLS
   connection string. Verify `pg_trgm` is supported/enabled on that branch.
2. Put that branch's connection string in your local ignored `.env` as
   `DATABASE_URL`. Run `pnpm db:migrate` against the branch and review the
   resulting schema before using any production database. Migrations connect
   directly to the branch; they do not run inside request handlers.
3. Run `pnpm db:seed` to create missing core lanes. Optional fictional data on a
   development branch uses `ALLOW_DEMO_SEED=true pnpm db:seed:demo`.
4. Authenticate Wrangler with `pnpm exec wrangler login`. Create a Hyperdrive
   configuration in the Cloudflare dashboard using the branch's TLS connection
   settings. Disable Hyperdrive query caching for this prototype so edits and
   future session writes are immediately visible. Do not put credentials in
   shell arguments or tracked config.
5. Replace the all-zero Hyperdrive ID in `wrangler.jsonc` with its real ID.
   Preserve `nodejs_compat`. Keep `localConnectionString` pointed at local
   Docker Postgres; the deployed binding uses the configured remote origin.
6. Run `pnpm cf:typegen`, `pnpm build`, then `pnpm deploy`. Verify the
   deployed homepage, filtered directory, program URL and one RPC call.

The prototype is marked `noindex` until real data and a public launch are ready.
Configure staging access before collecting any visitor data or adding admin
features. The all-zero binding ID deliberately makes remote deployment
incomplete until you supply a real development binding.

## Continue building

See [architecture decisions](docs/architecture-decisions.md), the
[ingestion runbook](docs/ingestion.md) and [discovery setup](docs/discovery.md).
The [taxonomy and matching analysis](docs/taxonomy-analysis.md) audits the
November 17 inventory. The [tagging workflow](docs/tagging.md) now implements
45 controlled terms across six groups, with separate AI and data topics.
Run `pnpm tagging run --mode hybrid --limit 55` after configuring the model,
or use `pnpm ingest tag-pending` to backfill ingestion tagging. Open `/review`
to inspect and edit a tagged listing, then approve its content and tags together.
Untagged or failed records stay in ingestion until tagging is ready. Model calls use the provider-neutral
Vercel AI SDK; OpenAI credits can be used through Cloudflare BYOK.
Next: review a small real inventory, configure AI Gateway and compare the same
requests in AI-assisted and baseline modes before adding model-selected recommendations.

The initial folder was not a Git repository. No Git history or remote has been
created by this build.
