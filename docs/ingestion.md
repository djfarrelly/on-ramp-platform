# Partner ingestion

Source defaults register real organizations from `Entities` in
`context/mi-ecosystem-data.xlsx`, then import bounded samples of their public
events or programs. Imports create `pending_review` records; they never publish.
Tagging is now part of this pass: source proposals and organization profiles must
have current, non-empty usable tags before appearing on `/review`. Missing tags,
model failures and abstentions stay in ingestion. Human review approves the
listing and tags together with one **Approve & publish** action.

`pnpm ingest tag-pending` backfills pending records without changing ready ones;
add `--retry` to regenerate held failures/abstentions. It uses rules when Gateway
is unconfigured; `INGEST_TAGGING_MODE=hybrid` requires the configured Gateway model,
and `deterministic` explicitly selects rules. See [tagging](tagging.md).

The local `/review` UI supplies listing and tag-proposal review timestamps together.
For a CLI approval, also pass `--tag-proposal UUID --tag-expected ISO_TIMESTAMP`
from the inspected latest tag proposal. Missing or stale tag identity blocks
publication. CLI rejection may still be used to discard an untagged import.

| Source key                     | Organization / workbook row               | Default extraction                                                         | Sample cap          |
| ------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------- | ------------------- |
| `20fathoms-events`             | 20Fathoms / 123                           | The Events Calendar public JSON                                            | 5 current events    |
| `west-mi-works-events`         | West Michigan Works! / 98                 | The Events Calendar public JSON                                            | 5 current workshops |
| `grcc-programs`                | Grand Rapids Community College / 23       | HTML discovery + CSS selectors on program detail pages                     | 3 programs          |
| `spark-programs`               | Ann Arbor SPARK / 3                       | CSS selectors on three explicit program URLs                               | 3 programs          |
| `wcc-programs`                 | Washtenaw Community College / 95          | CSS selectors on Bootcamp and Exploration pages                            | 2 programs          |
| `innovate-marquette-programs`  | Innovate Marquette SmartZone / 27         | Elementor content selectors on three explicit service pages                | 3 programs          |
| `michigan-sbdc-programs`       | Michigan SBDC / 40                        | CSS selectors on startup, growth and technology service pages              | 3 programs          |
| `capital-area-mi-works-events` | Capital Area Michigan Works! / 8          | Event directory links + detail-page CSS, with explicit ISO date offsets    | 5 current events    |
| `techtown-programs`            | TechTown Detroit / 115 (`techtowncenter`) | Program page selectors prepared; **disabled pending publisher permission** | No live import      |

SPARK uses SPARK Lead, Entrepreneur Boot Camp, and Coaching & Mentorship.
This avoids treating every community event in SPARK's aggregate calendar as
an event organized by SPARK. GRCC uses Automotive Technician, Computer Support
Technician, and Welding / Fabrication Technician.

The second pass adds WCC's 5-Month Bootcamp and Exploration coaching; Innovate
Marquette's Innovation Journey, IMQT Protolab and Invent@NMU; and Michigan SBDC's
startup, growth and technology services. These are ongoing offerings, not
claims that a particular cohort is accepting applications. WCC's dated SolveIT!
page was excluded because its 2026 session had already ended. The program
descriptions preserve published restrictions and fees; unknown facts stay null.

TechTown was on the original shortlist, but its [terms, section 8](https://techtowndetroit.org/terms-of-service/)
prohibit automated collection and unauthorized deep links. Its database source
defaults to `is_enabled = false`, with a blocking note and no completed terms
review. No TechTown listings are imported. Obtain publisher permission and review
the current pages before enabling it; do not use LLM extraction or headless
rendering to bypass the restriction. Row 96 is Wayne State and is not registered
as a duplicate TechTown source. CAMW is the fourth live source for this pass,
adding Lansing career workshops and employer events instead.

Source IDs are stable and depend on the append-only bootstrap order. Bootstrap
never enables an existing disabled source or replaces a custom configuration.

## Random 20-organization batch — November 17, 2026

The next batch samples **20 entries without replacement from the 113 remaining
Entities rows** (122 populated rows minus the nine original profiles). Selection
happened before website inspection; unavailable or restricted sources were not
replaced with easier sites. The original workbook is unchanged. The
[selection and import manifest](ingestion-batches/2026-11-17-random-20.json)
records the random seed, workbook hash, row identities, related Programs/Courses/
Events rows, observed source URLs, policy notes and audited run IDs.

This pass registered **20 unpublished organization profiles and 21 sources**.
All **14 enabled runs succeeded**, creating **13 offering proposals and five
future event proposals**, all `pending_review`. Each offering source is capped
at one page; Michigan Works! Southwest's advertised public Events Calendar feed
is capped at five future events. These are small samples, not complete catalogs.
Published record counts and prior review decisions were preserved. No model
calls, taxonomy changes, automatic publication, schedules or remote resources
were added.

| Draw | Entities row | Organization / selected entry               | Website import result                                                          |
| ---- | ------------ | ------------------------------------------- | ------------------------------------------------------------------------------ |
| 1    | 55           | Michigan Workforce Development Board        | Disabled: Michigan.gov automated-collection restriction                        |
| 2    | 75           | ProsperUs Detroit                           | Disabled: automated scripts and deep links restricted                          |
| 3    | 94           | WMed Innovation Center                      | Disabled: fetch/connectivity failure                                           |
| 4    | 85           | Saginaw Valley State University             | 1 offering: Business Excellence Centers                                        |
| 5    | 66           | Muskegon Innovation Hub (GVSU)              | 1 offering: Business Incubator                                                 |
| 6    | 114          | Office of Future Mobility & Electrification | Disabled: current pages on Michigan.gov                                        |
| 7    | 13           | Davenport University                        | 1 offering: IPEx Enroll Anytime Online                                         |
| 8    | 33           | Lansing Community College                   | 1 offering: Workforce Solutions through BCI                                    |
| 9    | 84           | SEMCA Michigan Works!                       | 1 offering: Short-Term Training                                                |
| 10   | 19           | Endeavor Detroit / Midwest                  | Disabled pending content-reuse permission/review                               |
| 11   | 30           | Kettering University                        | 1 offering: Innovation and Entrepreneurship Minor; enrollment context retained |
| 12   | 116          | Michigan Central                            | Disabled pending content-reuse permission/review                               |
| 13   | 21           | GST Michigan Works!                         | 1 offering: Job Seeker Services                                                |
| 14   | 99           | Western Michigan University                 | 1 offering: Custom Programs                                                    |
| 15   | 38           | Michigan Community College Association      | 1 offering: Leadership Development; nomination context retained                |
| 16   | 74           | Oakland University                          | 1 offering: OU INC                                                             |
| 17   | 20           | Ferris State University                     | 1 offering: Customized Training and Corporate Development                      |
| 18   | 61           | Michigan Works! Southwest                   | 1 offering plus 5 career workshop events                                       |
| 19   | 118          | Detroit Means Business                      | 1 offering: 313 STRONG; unrelated third-party programs excluded                |
| 20   | 102          | Michigan Innovation Fund → MEDC             | MEDC profile registered; website source disabled after HTTP 403                |

Michigan Innovation Fund is a funding program rather than a separate
organization. The batch registers its verified organizational owner, MEDC,
without inventing a separate fund organization or conflating it with Michigan
Innovate Capital Fund. WMed and Western Michigan University remain distinct.
The workbook's parent references are retained in the selection manifest; this
pass does not create extra unselected parent organizations.

Michigan.gov's [terms of use](https://www.michigan.gov/policies) and
ProsperUs's [terms](https://prosperusdetroit.org/terms-conditions/) explicitly
restrict automated collection. [Endeavor](https://us.endeavor.org/terms-conditions/)
and [Michigan Central](https://michigancentral.com/terms-conditions/) restrict
incorporation/republication of their content. Those sources have no completed
import authorization; enabling a model, rendering adapter or replay is not a
workaround. WMed's failed connection and MEDC's HTTP 403 also remain unresolved.
Their profiles came from the supplied workbook, not an unauthorized website
import. Disabled-source notes explain the specific next step.

Defaults live in `src/services/ingestion/batches/random-20-2026-11-17.json`.
`batches.ts` registers explicit IDs in a separate namespace, leaving the original
nine bootstrap positions intact. Registration never resets edited profiles,
source configurations, policy notes or enabled flags. As with the original
bootstrap, new enabled sources still need an explicit source-review timestamp
before running. Runtime extraction continues to read `sources.config` and to
snapshot each effective configuration.

```sh
pnpm ingest setup --batch random-20-2026-11-17
# Record source-specific reviews if initializing a fresh database;
# use the normal `ingest terms --source KEY --note ...` command above.
pnpm ingest run --batch random-20-2026-11-17 --mode deterministic
```

`--batch` runs only enabled configurations belonging to this batch. Do not
combine it with `--all` or `--source`. Open `/review` to inspect the 38 new
profiles/listings; each organization must be approved before its child listings.
Tagging remains a separate next step. The existing source-level lane defaults
are provisional classifications, and no tag vocabulary or assignments were added.

## Southeast Michigan batch — November 17, 2026

`southeast-20-2026-11-17` adds **20 distinct organization/provider profiles**
from the workbook's remaining `Southeast` and `Detroit Metro` entries. The
selection excludes the original nine profiles and the preceding random batch.
The initial random draw used 20 of the 33 remaining regional rows. City of
Detroit Careers and Detroit Startup Fund are two sources under one City of
Detroit profile, so an additional row, Michigan Technology Services, was drawn
from the remaining pool with the same random generator. No restricted or
unavailable site was replaced to improve collection success.

The [selection and import manifest](ingestion-batches/2026-11-17-southeast-20.json)
preserves the original draw, additional ownership-deduplication draw, seed,
workbook hash, 21 selected workbook rows and related program/course/event rows.
Runtime defaults are in
`src/services/ingestion/batches/southeast-20-2026-11-17.json`, using explicit IDs
in a separate namespace. `batches.ts` selects the requested batch; older batch
identities, configurations and holds remain intact.

The live pass registered **22 sources** and completed all **16 enabled runs**,
adding **18 offering proposals and three upcoming event proposals**. Together
with the 20 profiles, all **41 new records are pending review**. A read-only
fingerprint audit confirmed that every earlier organization, offering, event
and source record was unchanged. No taxonomy, schema, publication, schedule,
vendor-account or model configuration changes were made.

| Workbook row(s) | Provider / organization                  | Website import result                                                                     |
| --------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| 10, 112         | City of Detroit                          | Careers portal and Detroit Startup Fund: 2 offerings under one owner                      |
| 82              | SCORE Southeast Michigan                 | Disabled: HTTP 403                                                                        |
| 4               | Automation Alley                         | Disabled: requested crawl delay exceeds the fetcher's supported manual-pass maximum       |
| 26              | Henry Ford College                       | 1 offering: Apple Certified Support Professional; published price and duration retained   |
| 16              | Detroit Regional Chamber                 | 1 offering: Leadership Detroit; 3 Chamber-organized events                                |
| 28              | Invest Detroit                           | 1 offering: Small Business Support                                                        |
| 97              | Wellfound                                | Disabled: harvesting/redistribution restrictions                                          |
| 122             | Techstars Detroit Mobility               | Disabled: original program URL returns 404; current cohort unverified                     |
| 15              | Detroit Employment Solutions Corporation | 1 offering: employer Customized Training                                                  |
| 68              | NextEnergy                               | Disabled: robots.txt could not be verified                                                |
| 11              | Cleary University                        | 1 offering: Career Development; student-service context retained                          |
| 18              | Eastern Michigan University              | 1 EMU-branded entrepreneurship course from its separately published public course catalog |
| 67              | New Economy Initiative                   | 1 offering: MI Small Business Helper                                                      |
| 64              | Motor City Match                         | 2 offerings: Plan Track and Cash Track                                                    |
| 105             | Ann Arbor/Ypsilanti Regional Chamber     | 1 offering: A2Y Leadership                                                                |
| 41              | Macomb Community College                 | 2 offerings: Basic Computer Skills and Workplace Computing Skills                         |
| 6               | Build Institute                          | 1 offering: BUILD Basics                                                                  |
| 7               | Built In Detroit                         | Disabled: automated-access prohibition                                                    |
| 43              | Michigan Black Business Alliance         | 1 offering: Capital Connect; historical workbook name preserved in the manifest           |
| 52              | Michigan Technology Services             | 2 offerings: AI Prompt Engineering and Network+ Training                                  |

The Detroit Regional Chamber feed contains third-party member submissions.
This source explicitly requests its observed `Chamber` category (`categories=32`),
excluding `Member-Submitted Events` (`215`). The returned categories and organizer
attribution were checked against saved evidence. The three imported events are
Holiday Open House (Detroit), AI Office Hour (online), and the 2027 Detroit
Policy Conference (Detroit). Do not remove that category filter or attribute
member-submitted events to the Chamber.

This batch captures ongoing offering descriptions, not proof of current cohort
availability. A2Y's page references a 2024 class; the workbook notes an earlier
Build Institute operational pause; MTS says public AI workshop dates will be
announced. No accepting-application status or event date was invented. EMU's
original CFE source failed policy verification; the imported course comes from
a distinct, public EMU-branded course-catalog source, with no collection of the
inaccessible CFE page. Source URLs and editorial caveats remain in each source's
policy note and the manifest.

HFC's [content-sharing policy](https://www.hfcc.edu/copyright) permits sharing
public content with HFC attribution and a link to the original source. Keep
that attribution and link; do not import images or teaching materials under
that allowance. [Built In's terms](https://builtin.com/legal/community-terms-of-use)
prohibit automated access, and [Wellfound's terms](https://wellfound.com/terms)
restrict harvesting and redistribution. Those sources remain disabled. The
City's [policy](https://detroitmi.gov/privacy) restricts commercial reuse; the
bounded City imports are for the neutral public-service directory, with source
links and no resale or automatic publication. No model or rendering fallback
was used for blocked sources.

```sh
pnpm ingest setup --batch southeast-20-2026-11-17
# On a fresh database, record a source-specific terms review for each enabled source.
pnpm ingest run --batch southeast-20-2026-11-17 --mode deterministic
```

Offering sources are capped at one or two pages and the Chamber calendar at
three events. Review the new organization profiles before approving their
children. Tag vocabulary and assignment work remains separate.

## Remaining Southeast Michigan entries — November 17, 2026

The follow-up workbook scan found **12 remaining entries**, fewer than the
requested 20, after excluding the original sources and both preceding batches.
All twelve were registered as pending organization profiles. This exhausts the
workbook entries labeled `Southeast`, `Detroit Metro` or `Southeast Michigan`
that had not already been processed; previously disabled sources still need
their access or publisher restrictions resolved.

The [selection and import manifest](ingestion-batches/2026-11-17-southeast-remaining.json)
records workbook rows, exclusions, original values, source-policy notes, stable
IDs and actual run results. Runtime defaults are in
`src/services/ingestion/batches/southeast-remaining-2026-11-17.json` under batch
key `southeast-remaining-2026-11-17`. Registration created **12 profiles and 13
sources**; nine enabled runs succeeded and proposed **9 offerings and 3 events**.
All **24 new records remain `pending_review`**. Existing organizations,
offerings, events and source configurations were unchanged, checked using
before/after row fingerprints.

| Workbook row | Organization                      | Bounded result                                               |
| ------------ | --------------------------------- | ------------------------------------------------------------ |
| 34           | Lawrence Technological University | 1 Centrepolis manufacturer-support offering                  |
| 42           | Macomb/St. Clair Michigan Works!  | 1 classroom-training assistance offering                     |
| 60           | Michigan Works! Southeast         | 1 workforce-education offering; 3 upcoming webinars          |
| 72           | Oakland Community College         | 1 employer custom-training offering                          |
| 73           | Oakland County Michigan Works!    | Profile only: robots.txt could not be verified               |
| 77           | Purpose Jobs                      | 1 public Slack-community resource; no member content or jobs |
| 79           | SCORE Ann Arbor Area              | Profile only: official chapter page returned HTTP 403        |
| 86           | Schoolcraft College               | 1 Business Development Center offering                       |
| 89           | University of Michigan            | Profile only: Michigan Ross page returned HTTP 403           |
| 90           | University of Michigan - Dearborn | Profile only: official site returned HTTP 403                |
| 93           | Velocity Center                   | 2 offerings: Accelerator and Incubator Programs              |
| 96           | Wayne State University            | 1 Executive and Professional Development offering            |

Several workbook links needed correction. Macomb/St. Clair now uses its official
`msc-mw.org` site; Michigan Works! Southeast uses `mwse.org`, whose current
five-county description replaces the workbook's Monroe claim. Oakland and
Schoolcraft listings use their current official workforce/BDC pages. The
Schoolcraft BDC page links to a legacy APEX URL that returns 404, so that detail
page was not imported as a separate program.

Wayne State's workbook row points to TechTown, which is already registered and
disabled for a collection restriction. This batch uses Wayne's separately
published `execed.wayne.edu` page and university identity. TechTown was neither
duplicated nor fetched or enabled. Four inaccessible sources remain disabled
without a terms-review timestamp; no model or rendering fallback was used.

The Michigan Works! Southeast feed uses `organizer=7901` and a manual-batch
`start_date=2026-11-17` bound, with a three-event sample cap. Returned organizers
were checked against the provider. The imported webinars are Resume Strategies
(November 18), Timeless Talent: Tips to Avoid Ageism (November 19), and 10 Steps
to Reemployment (November 20). Source UTC times are preserved; no city was
invented for online events. Advance the date bound when preparing a later batch.

```sh
pnpm ingest setup --batch southeast-remaining-2026-11-17
# On a fresh database, review and record terms for each enabled source first.
pnpm ingest run --batch southeast-remaining-2026-11-17 --mode deterministic
```

Source policies and access checks are dated observations, not publisher
endorsements. Imports preserve source links, assessment/eligibility conditions,
county delivery limits and the Velocity programs' different business stages.
No accounts were created, applications submitted, taxonomy changes made, AI
calls used or schedules enabled. The workbook was read without modification.
Validation passed: 39 unit tests, 37 isolated database tests, typecheck and
production build.

## Local commands

With the existing local database running:

```sh
pnpm db:migrate
pnpm ingest setup
pnpm ingest sources
```

Setup creates missing organizations as unpublished profiles, their locations
and lane assignments, source configurations, and a local-only staff reviewer.
Its reviewer ID is printed in the result. This bootstrap identity has no login
credentials; it is an audit identity for local CLI review, not an auth bypass.
Setup is repeatable and does not reset edited selectors, reviews or source state.

For each source, inspect its public page and any linked usage terms, then record
what you reviewed:

```sh
pnpm ingest terms --source grcc-programs --note "Source-specific review note describing the pages and terms inspected"
```

The review timestamp and note are stored on `sources`. A missing review blocks
execution. The fetcher checks robots.txt at runtime, identifies itself, spaces
requests, follows only allowed-host HTTPS redirects, bounds response sizes and
times out requests. Failed robots checks stop fetching. This source review is
not a claim that a publisher has granted permission.

```sh
pnpm ingest run --all --mode deterministic
pnpm ingest run --source grcc-programs --mode deterministic --limit 2
pnpm ingest run-info --run RUN_UUID
pnpm ingest proposals
pnpm ingest proposals --source grcc-programs
```

To refresh only the four sources in the second live batch, after recording each
source's review note:

```sh
pnpm ingest run --source wcc-programs --mode deterministic
pnpm ingest run --source innovate-marquette-programs --mode deterministic
pnpm ingest run --source michigan-sbdc-programs --mode deterministic
pnpm ingest run --source capital-area-mi-works-events --mode deterministic
```

The November 13 local sample added **8 program proposals and 5 event proposals**
from these four sources. Evidence snapshots are kept under ignored
`.data/ingestion/`. Open `/review`, approve the organization before its child
listings, then use `/discover` to test the approved content. Public search does
not include pending proposals. Previous review decisions remain intact.

One failed source does not stop the remaining sources. The command exits nonzero
if any source fails. The sample cap in the database is the maximum; `--limit`
can reduce it. No schedule or cron is enabled. Valid empty calendars succeed
without marking any old records missing. Partial samples cannot establish that
a listing disappeared, so disappearance detection is deliberately disabled.

## Edit deterministic extraction in the database

Selectors are loaded from **`sources.config` for every run**, not from a
hardcoded scraper implementation. Export, edit, and validate the configuration:

```sh
pnpm --silent ingest config --source grcc-programs > /tmp/grcc-source.json
# Edit /tmp/grcc-source.json.
pnpm ingest config --source grcc-programs --file /tmp/grcc-source.json
```

Example DOM portion:

```json
{
  "scope": "body",
  "fields": {
    "name": { "selector": "h1", "required": true },
    "description": {
      "selector": "main .field--name-body > p:nth-of-type(-n+4)",
      "required": true
    }
  }
}
```

Each field supports `selector`, optional `attribute` (for example `href` or
`datetime`), and `required`. Scopes must match exactly one element. Missing
required fields fail the run visibly rather than generating empty listings.
HTML text is converted to plain text; scripts, navigation, forms and embeds
are removed. Unknown facts stay null rather than becoming guessed prices,
eligibility requirements or dates.

Discovery supports `tribe-json`, explicit `pages.urls`, or `links` with a CSS
selector and an allowed path prefix. Hosts, sample limit, lane assignment,
timezone, DOM rules and optional model/prompt settings are versioned together.
The effective configuration and mode are copied into each run for provenance.

## Compare LLM extraction

Use an existing Cloudflare account and configure AI Gateway before making paid
calls. Choose a model available through its chat-completions endpoint that
supports JSON-schema structured output. No direct-provider fallback exists.

In ignored `.env` for the CLI (Wrangler secrets for Workers):

```dotenv
CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID
AI_GATEWAY_ID=YOUR_GATEWAY_ID
CLOUDFLARE_AI_TOKEN=YOUR_TOKEN
# Set only after configuring the gateway's infrastructure spend limit.
AI_GATEWAY_SPEND_LIMIT_CONFIGURED=true
```

The token needs Workers AI Read for inference. Configure the agreed global
spend limit in **AI Gateway → Settings → Spend limits**, with blocking behavior
and coverage of the selected model. The flag above is an operator attestation,
not the budget enforcement mechanism. Cloudflare enforces the limit; its spend
tracking is eventually consistent, so simultaneous in-flight calls can briefly
overshoot. This CLI runs sources sequentially. See [Cloudflare spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/).

```sh
pnpm ingest config --source grcc-programs --model YOUR_PROVIDER/YOUR_MODEL
pnpm ingest run --source grcc-programs --mode llm
```

The model and prompt version are stored in the database. The model receives
only fetched evidence, a bounded extraction prompt and a strict output schema.
Unknown URLs, missing event dates, invalid fields and duplicate identities are
rejected before proposals are written. Provider IDs from the fetched JSON are
authoritative; for HTML, identity comes from the observed URL. A model cannot
choose an arbitrary record identity or publish a listing.

Prompt and response payload logging is disabled on inference requests; token
usage, model and prompt version are recorded with the run. Configure provider
retention and any independent Logpush policy consistently before activation.
No real model calls were made during the initial local verification; the
adapter and failure handling are covered by mocked-gateway tests.

## Replay without fetching websites again

Local evidence is saved under ignored `.data/ingestion/RUN_UUID/` (override with
`INGEST_SNAPSHOT_DIR`). Each run has a manifest, raw documents and its validated
extraction. `source_runs.raw_snapshot_key` points to the manifest.

```sh
pnpm ingest replay --run RUN_UUID --mode deterministic
pnpm ingest replay --run RUN_UUID --mode llm
```

Replay creates a new audited run against the current database configuration,
using only the original saved documents. It never falls back to website
fetching if a requested URL is missing. This lets you change selectors or
compare extraction strategies on the same evidence. Changing discovery URLs
or a calendar request's sample limit can require a fresh fetch.

Replay also preserves the original event-filter reference time (`asOf`) so
identical evidence does not produce different samples merely because time has
passed. The new run's own audit timestamps still reflect its actual execution.

## Review and publish deliberately

For local interactive review, run `pnpm dev` and open `/review`. No sign-in is
required in development. Select a proposal, inspect its details/source link,
then choose **Approve & publish** or **Reject proposal**. The UI handles reviewer
identity and timestamps; approve the organization first or use its shortcut
from a blocked child listing. See [the review UI](review.md). Production builds
disable this local exception. The CLI remains available below.

Inspect the proposals and raw evidence first. Approve the organization before
its programs or events. Copy the current `updatedAt` from `ingest proposals`:

```sh
pnpm ingest review --type organization --id ORGANIZATION_UUID --decision approve --expected UPDATED_AT_ISO --reviewer STAFF_UUID
pnpm ingest review --type offering --id OFFERING_UUID --decision approve --expected UPDATED_AT_ISO --reviewer STAFF_UUID
pnpm ingest review --type event --id EVENT_UUID --decision reject --expected UPDATED_AT_ISO --reviewer STAFF_UUID
```

The reviewer must be active staff. Stale review timestamps and already-reviewed
records are rejected. Rejected content is not reopened on identical reruns.
Changed published records get a pending replacement. Approval updates the live
record in place, preserving its ID and canonical URL, and archives the proposal.
Reviewed imported programs appear in the directory. Reviewed events have
`/events/:slug` pages linked from their organization's profile.

An active-run unique index prevents concurrent ingestion of one source. If a
process dies, inspect the run and recover it explicitly after one hour:

```sh
pnpm ingest recover --run RUN_UUID
```

## Workers and the API boundary

All domain logic lives in `src/services/ingestion/`; the CLI and Workflows call
the same functions. File snapshots are the local adapter. Workers use the
`INGEST_SNAPSHOTS` R2 binding. `IngestSourceWorkflow` runs one bounded pass as a
durable step; retries/recovery are explicit in this first implementation.

Administrative RPC methods are under `/api/v1/ingestion.*`, separate from the
public directory tool registry. They are disabled until a minimum 32-character
`INGEST_ADMIN_TOKEN` and an active staff `INGEST_REVIEWER_ID` are configured.
Requests need `Authorization: Bearer ...`; put Cloudflare Access in front of
these paths before deploying them. This is a temporary bootstrap interface
until the Better Auth staff portal exists, not a public API-key feature.

`ingestion.runSource` dispatches the Workflow and returns its run/workflow ID;
poll `ingestion.getRun` after the run starts. The CLI executes directly. Other
methods list sources/proposals, update source configuration, record source
reviews, recover interrupted runs, and approve/reject proposals. Request bodies
are bounded and schemas reject unknown fields.

Before remote deployment: configure the real Hyperdrive development binding,
create the named R2 bucket, configure Workflow bindings/secrets and Access,
then bootstrap and review source policies against the development database.
No remote resources or schedules were provisioned by the local build.
