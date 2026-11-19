# On-Ramp — architecture (build-relevant extract)

> Extracted from `onramp-architecture-plan.md` §3–§7 (the client deliverable).
> Cost model, hours, ownership and handoff sections are deliberately omitted.

## 3. System architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         VISITORS / PARTNERS                           │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  HTTPS
┌───────────────────────────────▼──────────────────────────────────────┐
│                  CLOUDFLARE EDGE (WAF, cache, bot mgmt)               │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│              TANSTACK START APPLICATION  ·  Cloudflare Workers        │
│                                                                       │
│   PRESENTATION                                                        │
│   ┌──────────┬──────────┬───────────┬──────────┬──────────────────┐  │
│   │ 4 Lane   │ Partner  │  Intake   │ Partner  │  Admin Back      │  │
│   │ Pages    │ Directory│  Flow     │ Portal   │  Office          │  │
│   │          │ + Map    │           │          │                  │  │
│   └──────────┴──────────┴───────────┴──────────┴──────────────────┘  │
│   ─────────────────────── API BOUNDARY (R4) ───────────────────────   │
│   SERVICES                                                            │
│   ┌──────────┬──────────┬───────────┬──────────┬──────────────────┐  │
│   │ Routing  │ Directory│  Review   │ Report   │  Identity &      │  │
│   │ Engine   │ & Search │  Queue    │ Builder  │  Permissions     │  │
│   └──────────┴──────────┴───────────┴──────────┴──────────────────┘  │
└───────────┬──────────────────────────────────────────┬───────────────┘
            │ Hyperdrive (pool + cache)                │ bindings
┌───────────▼──────────────────┐        ┌──────────────▼───────────────┐
│   POSTGRESQL (PlanetScale)   │        │   CLOUDFLARE WORKFLOWS       │
│                              │        │                              │
│  organizations   sources     │◄───────┤  ingest-all (cron, nightly)  │
│  offerings       source_runs │        │  ingest-source (per partner) │
│  events          review_queue│        │  referral-lifecycle          │
│  lanes / tags    referrals   │        │  retention-sweep             │
│  intake_*        snapshots   │        │  report-rollup               │
│  users / memberships         │        └──────┬───────────────┬───────┘
│  tracking_events             │               │               │
└──────────────────────────────┘        ┌──────▼──────┐ ┌──────▼──────┐
                                        │ Browser Run │ │ AI Gateway  │
                                        │ (render)    │ │ (extract)   │
                                        └──────┬──────┘ └──────┬──────┘
                                               │               │
                                        ┌──────▼───────────────▼──────┐
                                        │  R2: raw page snapshots,     │
                                        │       CSV exports            │
                                        └──────────────────────────────┘

   External: Resend (email) · Mapbox (tiles) · Sentry (errors)
             Middle Third CRM (reference IDs only, no direct integration)
```

### The API boundary

R4 is a contractual commitment and it is easy to violate accidentally. The rule
enforced in this codebase:

> Page components call service functions. Service functions call the database.
> No page component contains a SQL query, a routing decision, or a business rule.

Concretely, every capability is exposed as a versioned route under `/api/v1/`:

| Route | Purpose | Year 2 use |
|---|---|---|
| `GET /api/v1/organizations` | Directory listing, filterable | Public partner API |
| `GET /api/v1/organizations/:slug` | Profile | Public partner API |
| `GET /api/v1/offerings` | Program/course search | Public API |
| `GET /api/v1/events` | Upcoming events | Partner site embeds |
| `POST /api/v1/intake/sessions` | Begin intake | **Embeddable widget** |
| `POST /api/v1/intake/sessions/:id/answers` | Submit step | **Embeddable widget** |
| `POST /api/v1/intake/sessions/:id/route` | Execute routing | **Embeddable widget** |
| `GET /api/v1/lanes` | Lane metadata and copy | Partner site embeds |

In year 1 these are same-origin and consumed by our own site. Nothing about them
is public yet. But the separation is real, which means the year 2 widget
conversation is about API keys, rate limits and CORS, not a rebuild. That is
precisely what the proposal promised MEDC, and it is cheap to honor if done from
the first commit and expensive to retrofit later.

---

## 4. Technology selections

### Framework: TanStack Start

React with server-side rendering, type-safe routing, and server functions.
Rationale:

- **First-class Cloudflare Workers support.** TanStack Start is an official
  Cloudflare partner framework with a documented deployment path. It runs
  natively on the Workers runtime rather than through a compatibility shim.
- **SSR without lock-in.** Public pages are server-rendered for SEO and
  accessibility; the admin back office is an interactive client application.
  One framework serves both.
- **File-based routing with type-safe parameters**, which keeps the API boundary
  above from eroding.
- **It is React.** The hiring pool and the AI-assisted-development tooling that
  Middle Third will rely on post-handoff both assume React.

*Considered and set aside:* Next.js. It remains the default choice for this kind
of application, but on Cloudflare it runs through the OpenNext adapter, a
translation layer between a framework designed for one host and a runtime built
by another. That is a durable source of friction for features like middleware,
image optimization and caching, and it is a bad place for a project that must be
operable by someone else in twelve months. Next.js also pulls persistently toward
Vercel, which would split the stack across two vendors and two bills for no
offsetting benefit.

### Hosting: Cloudflare Workers

One platform provides compute, durable background execution, object storage,
image handling, headless browser rendering, an AI gateway, DNS, WAF, bot
management and cookieless analytics. For a project of this size, consolidating
these into one vendor is worth more than best-in-class at any individual layer:
one access transfer at handoff, one bill to reconcile against the contractual
cost cap, one place to look when something breaks.

Workers also removes an entire category of operational work: no servers, no
container orchestration, no scaling configuration, no patching. For a platform
that will be maintained part-time by a small nonprofit team, that is the single
highest-value property of the stack.

### Database: PostgreSQL on PlanetScale

PostgreSQL, not SQLite. The dataset is small today, but this database is intended
to be the system of record for a statewide ecosystem for years, through
onboarding waves, schema growth and an eventual public API. Postgres gives us
real types, strong constraints, JSONB where the data is genuinely
semi-structured, native full-text search, and an operator and tooling ecosystem
that any future developer already knows.

PlanetScale specifically:

- **Database branching.** A schema migration can be developed and reviewed on a
  branch before touching production, the same workflow as code review. For a
  platform that will outlive this engagement, safe migration practice matters
  more than raw performance.
- **First-class Cloudflare integration.** Documented Hyperdrive support, and
  databases can be provisioned and billed directly through the Cloudflare
  dashboard, which keeps the handoff to a single vendor account transfer.
- **Operationally boring.** Managed backups, point-in-time recovery, insights and
  query analysis without us building any of it.
- **Cost.** Single-node Postgres from $5/month with 10 GB storage included, far
  more than this dataset will need in year 1.

*Considered:* Supabase. Credible alternative, bundles auth and storage, has a
free tier. Set aside because we do not need the bundle (Cloudflare covers storage,
Better Auth covers auth), and because PlanetScale's branching workflow and
Cloudflare billing integration better serve the migration-safety and handoff
requirements. Nothing in the schema is PlanetScale-specific; moving to Supabase,
Neon or self-hosted Postgres later is a connection-string change plus a dump and
restore.

**Connection handling.** Workers are numerous and short-lived; Postgres
connections are scarce and expensive. Cloudflare Hyperdrive sits between them,
pooling connections and caching read queries at the edge. Without it, a traffic
spike exhausts the connection pool. With it, the application opens what looks
like a local connection and Hyperdrive manages the real one.

### ORM: Drizzle

TypeScript schema definitions that generate versioned SQL migrations. SQL-like
query syntax, so the generated queries are predictable and a Postgres developer
can read them without learning an abstraction. Lightweight enough to run inside
the Workers runtime. Migrations live in the repository as plain SQL files, which
means the database is reproducible from source, which is a handoff requirement.

**On the admin database viewer.** Drizzle Studio has four flavors and the
distinction matters here:

| Option | Fit |
|---|---|
| `drizzle-kit studio` (free, local) | Development only. Not exposable remotely. |
| **Drizzle Gateway** (free, self-hosted) | A Docker container or binary with multi-database connections, a master password and per-user passcodes. Runs in our infrastructure, data never leaves it. |
| Chrome extension (free) | Browse from a vendor console. Convenience, not a product feature. |
| Studio Component (paid, B2B) | The genuinely embeddable UI component. |

Drizzle Gateway is the practical answer for a developer/admin database browser,
but it is a container, so it does not run *inside* a Cloudflare Worker. It would be
deployed separately (Cloudflare Containers, or any small host) behind Cloudflare
Access restricted to named Middle Third accounts.

**Recommendation:** do not put a raw database browser in Middle Third's admin
back office. Build purpose-built admin screens for the things MT actually does:
the review queue, organization and program CRUD, routing rules, reports, and
keep Drizzle Gateway as a developer and emergency-operations tool behind Access.
A general-purpose table editor handed to non-technical staff is a data-integrity
incident waiting to happen, and it bypasses every validation and audit rule the
schema establishes. If the goal is "I want to look at the data quickly," Gateway
behind Access gets us there without that exposure.

### Background work: Cloudflare Workflows

Durable, multi-step execution with automatic retries, persisted intermediate
state, and resumption after failure. The ingestion pipeline is a long-running,
failure-prone, multi-stage process across a few dozen third-party websites; it
needs to be durable, isolated per source, and observable.

Relevant platform limits, confirmed:

| Property | Limit (Workers Paid) |
|---|---|
| CPU time per step | 30 s default, configurable to 5 min |
| Wall-clock per step | Unlimited. Network and database waits are free |
| Steps per workflow | 10,000 default, up to 25,000 |
| `step.sleep` maximum | 365 days |
| Concurrent running instances | 50,000 (waiting instances do not count) |
| Instance state retention | 30 days |

Two of these shape the design directly. **Unlimited wall-clock per step** means a
slow partner website cannot time out a run the way it would on a conventional
serverless function. **`step.sleep` up to 365 days, with sleeping instances free
of concurrency limits**, means the referral confirmation lifecycle (send,
wait 14 days, remind, wait 16 more, expire) is a single readable workflow rather
than a set of cron jobs polling a table for due reminders.

*Considered:* Inngest. Technically excellent and the natural fit for this
workload. Set aside for two reasons. First, keeping the stack on one vendor is a
primary goal, and Workflows covers the requirement natively. Second, stated
plainly, the author of this document is a co-founder of Inngest. On a neutral,
state-sponsored platform with a full vendor handoff obligation, selecting one's
own product creates an appearance problem that is not worth the technical
delta. The business logic is written as plain TypeScript functions with the
workflow layer as a thin orchestration wrapper, so the pipeline stays portable to
any durable-execution system.

### Page fetching: Cloudflare Browser Run

Headless Chrome as a platform binding. Needed because many partner event pages
are JavaScript-rendered and return nothing useful to a plain HTTP fetch. Replaces
what would otherwise be a third-party scraping service (Firecrawl, ScrapingBee)
or self-managed Playwright infrastructure.

Current limits: 120 concurrent browsers per account on paid plans, billed at
$0.09 per browser-hour. At twenty-odd sources rendered nightly for a few seconds
each, this is a rounding error. See §10.

Fetching is **tiered**, cheapest first: structured feed (iCal, RSS, JSON API) →
plain HTTP fetch → headless render. We only pay for a browser when the page
actually requires one, recorded per source in `sources.config`.

### AI extraction: AI Gateway

Cloudflare AI Gateway sits in front of the model provider and gives us caching,
per-request logging, rate limiting and **hard spend caps**. That last one is not
a convenience: SOW #002 requires an agreed monthly third-party cost limit with
configured hard limits. The gateway enforces it at the infrastructure layer
rather than relying on application code to behave.

Model choice is configuration, not architecture. `sources.config.extractionModel`
is per-source, so an awkward site can be escalated to a stronger model without
changing anything else. Starting point: Claude Haiku or GPT-4o-mini with
structured output against a strict schema. Cloudflare Workers AI is available as
a fallback if we want extraction to stay entirely in-platform.

### Authentication: Better Auth

Passwordless email one-time passcode, as specified in the development plan.
Open-source, self-hosted, runs on the Workers runtime, stores its tables in our
own Postgres. No per-seat pricing, no external identity vendor in the handoff
inventory, and user records live in the same database as the memberships that
reference them.

Middle Third admin accounts are additionally protected by Cloudflare Access in
front of the `/admin` routes, a second independent factor at the edge for the
highest-privilege population.

*Considered:* Clerk and WorkOS (excellent, but add a vendor, a bill and a
per-seat cost to the handoff for a feature we need a simple version of); Cloudflare
Access alone (great for a known set of staff, wrong for 20–60 partner users who
self-register).

### Maps: Mapbox GL JS

Vector tiles, accessible controls, well-documented clustering for the directory
view. Free tier covers anticipated volume comfortably.

*Noted alternative:* MapLibre GL with Protomaps tiles hosted on R2 eliminates the
recurring vendor entirely and keeps map hosting inside the Cloudflare account.
Slightly more setup, zero ongoing cost or vendor dependency. Worth revisiting at
handoff if Middle Third wants to minimize the number of accounts they inherit.

### Analytics: Cloudflare Web Analytics

Cookieless, no client-side identifiers, no consent banner required. For a
state-sponsored platform serving people exploring career transitions, collecting
less is the right default and it meaningfully simplifies the privacy posture.

Product funnel analytics are separate and live in our own `tracking_events`
table, because we need exact, exportable, auditable numbers for MEDC reporting, which
is a different job from understanding web traffic.

---

## 5. Critical path 1 — Data freshness

Keeping the data current is the hardest part of this build, and it's the reason
most of the architecture looks the way it does. What follows is the rough shape
we think will work rather than a finished design. Phase 1 will teach us a lot
and some of this will change.

### Guidance

> Automation proposes, a person disposes. Publishing requires human-in-the-loop.

### Roughly how it runs

Every night a job wakes up, looks at the sources we've enabled, and starts one
small run per source. Each run does about the same handful of things:

1. Get the content. If the partner publishes a feed we read that. If not we
   fetch the page, and we only spin up a browser when the page needs one to
   render.
2. Keep a copy of what we read.
3. Pull records out of it. Feeds go through a normal parser. Pages go through a
   model with a strict schema.
4. Compare against what we already have: new, changed, unchanged, or gone.
5. Put anything new or changed into the review queue, and stop there.

Then someone at Middle Third works the queue and approves, edits or rejects.
Approving is the thing that updates the live record. Nothing automated publishes
on its own.

```
Nightly job
   │
   ▼
one run per source  (they're independent, so a broken site
   │                 only affects its own run)
   ▼
fetch ──► keep a copy ──► pull out records ──► compare to what we have
                                                        │
                                                        ▼
                                                 review queue
                                                        │
                                            a person approves / edits / rejects
                                                        │
                                                        ▼
                                                 live record updated
```

### Why this shape

- One run per source. A partner with a broken site, an expired certificate or
  an anti-bot wall doesn't affect the other twenty-nine.
- Feeds before scraping. They're more reliable, and they don't need a model at
  all. Part of Phase 1 is finding out which partners already publish one. The
  dev plan flagged a few likely candidates: libraries on LibCal, Eventbrite
  organizers, public Google Calendars, Meetup groups.
- We keep the raw copy. It means we can improve extraction by re-running against
  stored content instead of re-crawling partner sites, and if a partner ever
  disputes a listing we can show them what their page said that day.
- The review queue is really the product here. Grouped by organization,
  before/after diffs, approve or edit-then-approve or reject, bulk approve for
  feeds we trust. If clearing a night's output takes more than ten minutes, this
  doesn't work no matter how good the extraction is. Worth prototyping and
  measuring early.
- Trust can grow over time. A steady feed from a launch partner might eventually
  auto-apply low-risk changes, say a date move on an event that already exists,
  while anything new or model-extracted still goes to a person. Review effort
  should track actual risk.

### When things break

| What happens | What we do |
|---|---|
| Source unreachable | Retry with backoff. After three failed runs in a row, flag the source in admin and email whoever is on it |
| Feed is malformed | Record the parse error against that run, let the other sources carry on, surface it in the source's health view |
| The model returns something that doesn't fit the schema | Retry once with a repair prompt. If it fails again, record an extraction failure and attach the raw copy |
| An event vanishes from the source | Mark it stale and surface it for review. We don't delete it |
| Usage cap reached | The gateway stops further calls and ingestion pauses until someone looks. This is an expected operating state, not a defect |

### Crawl etiquette

We're reading partner websites on a schedule, so we try to be a good citizen
about it. We do our best to respect what a site asks for: following robots.txt,
identifying ourselves with a contact URL, not re-downloading pages that haven't
changed, and keeping the request rate polite. Nightly at most, weekly for
sources that rarely change. Partners can opt out, and we'd rather have a feed
than scrape anyone.

The database records what robots.txt said per source and when we checked, so
it's demonstrable rather than just claimed.

---

## 6. Critical path 2 — Intake, routing, referral

```
Visitor
   │
   ├─► Lane page ──────────────────► tracking_event: lane_viewed
   │
   ├─► POST /api/v1/intake/sessions ──► intake_sessions (anonymous)
   │
   ├─► Multi-step form
   │      questions defined in application code
   │      each step POSTs answers; progress survives refresh
   │
   ├─► POST .../route
   │      │
   │      ▼
   │   ┌────────────────────────────────────────────────┐
   │   │ ROUTING ENGINE                                  │
   │   │  1. Load active rules for the lane, by priority │
   │   │  2. Evaluate conditions against answers         │
   │   │  3. Resolve targets (direct, or tag query)      │
   │   │  4. Score and rank                              │
   │   │  5. Build an explanation for every match        │
   │   │  6. Apply fallbacks if under-matched            │
   │   └────────────────────┬───────────────────────────┘
   │                        ▼
   │                 routing_results (with stored explanation)
   │
   ├─► Results page: matched partners, why, what to do next
   │
   └─► Optional: "connect me" ──► consent ──► referrals
                                     │
                                     ▼
                          ┌──────────────────────────────┐
                          │ WORKFLOW: referral-lifecycle  │
                          │  notify partner contact       │
                          │  step.sleep 14 days           │
                          │  if unconfirmed → remind      │
                          │  step.sleep 16 days           │
                          │  if unconfirmed → expire      │
                          └──────────────────────────────┘
                                     │
                          partner clicks signed link
                                     ▼
                          referrals.outcome = 'confirmed'
                          → feeds the 60% follow-through metric
```

### Routing is deterministic first

The development plan commits to starting with deterministic rule-based routing,
with AI-assisted matching explored only if results disappoint. The architecture
backs that:

- **Rules are data**, stored in `routing_rules`, editable by Middle Third without
  a deployment.
- **Every match stores its explanation.** Shown to the visitor ("matched because
  you are early-stage, in Detroit Metro, seeking capital") and retained for the
  accuracy analysis in the Year 1 Impact Report.
- **Routing is testable.** A fixture set of personas with expected outcomes runs
  in CI on every rule change. This is what "explainable and testable with data"
  requires in practice, and it is the difference between a routing engine and a
  pile of conditionals.
- **No match is a designed state**, not an error. Under-matching falls back to
  lane-level recommendations and always surfaces something useful.

If AI-assisted matching is later needed, it enters as an *additional scoring
signal* alongside the deterministic rules, never as a replacement. A neutral
state-sponsored platform must be able to explain why it sent someone somewhere.

### The referral confirmation mechanism

Exhibit A commits to a **60%+ partner-confirmed referral follow-through rate,
reported monthly**. The mechanism for how a partner confirms a referral is still
an open design question. Proposed here for discussion, pending Middle Third's
input:

1. A routed individual opts in to a connection and consents.
2. A referral record is created with a signed, single-purpose token.
3. The partner's designated referral contact receives an email: who was routed
   (per consent), which program, and two buttons: "We connected" / "No response".
4. Clicking either records the outcome with no login required.
5. Unconfirmed referrals get a reminder at 14 days and expire at 30.
6. The monthly metric is computed from the resulting outcomes.

This is worth solving early. It depends on a behavior change from 20–30 partner
organizations, it is measured and reported, and it touches partner onboarding as
much as it touches software. Best addressed around Demo 1, while the partner
conversations are still being shaped.
*(Open question 5.)*

---

## 7. Accessibility

WCAG 2.1 AA is a requirement. The only reliable way to meet it is to
enforce it continuously through automation in the codebase and continuous integration tests rather than audit for it at the end. Retrofitting at the end can be time consuming and difficult.

| Stage         | Enforcement                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Components    | Semantic HTML first. Headless accessible primitives (Radix / React Aria) for anything interactive. No custom `div` controls.                 |
| CI            | `axe-core` automated checks on every pull request, on representative pages. Build fails on violations.                                       |
| Design tokens | Contrast ratios validated at the token level, so a non-compliant color cannot enter the palette.                                             |
| Forms         | Every input labeled; errors associated via `aria-describedby`; the intake flow is fully keyboard-navigable with managed focus between steps. |
| Maps          | The directory map is never the only way to access the data. The list view is complete, keyboard-operable and screen-reader friendly.        |
| Images        | `alt_text` required at the database layer for any public image.                                                                              |
| Manual        | Keyboard-only and screen-reader passes at each phase boundary, not only before launch.                                                       |
| Audit         | Formal audit in Phase 3 confirms a standard already being met.                                                                               |

---

