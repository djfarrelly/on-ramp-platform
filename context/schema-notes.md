# On-Ramp — schema notes

> Extracted from `onramp-database-schema-model.md`. The authoritative table
> definitions are in `schema.sql`; this file carries the rules the DDL cannot express.

## 4. Conventions

Applied uniformly across every table.

| Convention | Choice | Why |
|---|---|---|
| Primary keys | `uuid` (v7, time-ordered) | Safe to generate client-side, safe to expose, index-friendly ordering. No sequence leakage of record counts. |
| Timestamps | `timestamptz`, always UTC | Michigan observes DST; events and reporting periods both break on naive timestamps. |
| Created/updated | `created_at`, `updated_at` on every table, `updated_at` maintained by trigger | So we can always tell when a row last changed. |
| Lifecycle | `status` enum: `draft`, `pending_review`, `published`, `rejected`, `stale`, `archived` | One column covers the editing lifecycle, the ingestion review step, and removal. Nothing a partner or admin takes down is unrecoverable — `archived` hides it without destroying it. Hard delete is reserved for privacy erasure. See §9. |
| Freshness | `last_verified_at` | Answers "when did a human last confirm this?" per record. The stale-data list sorts on it. |
| Provenance | `source_run_id`, `reviewed_by`, `reviewed_at` on ingestible rows | Who approved this and which update run suggested it, without needing a separate history table. |
| Slugs | `slug citext`-style unique, immutable once published | Keeps public URLs stable — `/partners/techtown-detroit` shouldn't break later. |
| Enums | Postgres native `ENUM` for fixed sets, lookup tables for sets Middle Third may want to edit | Organization types and tags will change over time; `status` won't. |
| Multivalue | Join tables, never arrays or delimited strings | The spreadsheet's pipe-delimited `topic_tags` is the thing we're moving away from. |
| Polymorphism | Explicit join tables per parent type, not a `taggable_type` column | Postgres can't enforce a foreign key on a polymorphic column, so we'd lose the database's ability to catch bad references. |
| Money | `integer` cents plus a `*_text` display column | Costs in the source data are messy ("~$10,000", "Tuition", "Free"). Keep the human string, parse what we can. |
| Email | `text` with a `lower(email)` unique index | Avoids depending on the `citext` extension (see §15). |
| Migrations | Drizzle Kit → versioned SQL in the repo | Database is reproducible from source. Required for the handoff deliverable. |

---


---

## 8a. Expected schema evolution

**This schema will change as routing is built, and that is planned for.**

The routing engine is the one major component whose behavior is still being
designed, and it is the primary consumer of the classification model — lanes,
tags, and how records are matched to a person's situation. Expect the taxonomy
and the routing tables to evolve through Phase 1 as the prototype is run against
real personas and real partner data.

The model above is shaped to make that cheap. Classification is recorded as
flat, additive facts; structure is layered on once we know what routing actually
needs. **Changes here are an expected part of Phase 1, not a sign the model was
wrong.**

The two most likely evolutions, both additive and both roughly an afternoon of
work:

| If routing needs… | The change | Data impact |
|---|---|---|
| Enforced vocabularies — tags that must belong to a validated category | Promote `group_label` to a `tag_categories` table with a foreign key | None. Existing tags keep their tagging. |
| Tags nested under lanes — a lane page that browses by sub-category | Add a nullable `lane_id` to `tags`, backfill the mapping | None. Existing tags keep their tagging. |

Neither loses data, because the tagging itself is independent of how the
vocabulary is organized. The same is not true in reverse: committing to a
nested taxonomy now and discovering routing wants something else would mean
re-mapping every record.

Other areas expected to move during Phase 1:

- **`routing_rules`** — currently the minimum viable shape. Scoring weights,
  scheduling windows and result caps get added when a prototype shows they are
  needed, not before.
- **`offerings`** — if a `kind` turns out to need fields nothing else uses, those
  arrive as nullable columns or a side table. See §6 for which goes where.
- **Intake questions and answers** — questions live in code and answers are
  JSON for now, because the flow is still being designed. Once it settles, the
  stable parts can move into real tables. See §10 and open question 9.

Areas **not** expected to move: the ingestion review mechanism in §9, the
organization and offering spines, and the privacy and retention model. Those are
settled requirements and are worth getting right now.

---


---

## 15. Search, geography and performance

### Full-text search

Postgres native: a `tsvector` generated column on `organizations`, `offerings` and
`events`, GIN-indexed, weighted (name > summary > description > tags). Combined
with `pg_trgm` for fuzzy matching so "Washtenaw Comunity College" still resolves.

At 150–300 organizations and roughly 1,200 offerings, that's plenty. No
external search service in year 1. If relevance turns out to be a complaint,
the next step is a materialized search table well before it's a new vendor.

### Geography — not depending on PostGIS

PlanetScale supports a curated list of Postgres extensions. `pg_trgm` and
`fuzzystrmatch` are confirmed available; PostGIS isn't on the confirmed list, so
it's better not to design around it.

Instead we store `latitude` / `longitude` as plain numbers and do "within X
miles" as a bounding-box filter plus a distance calculation in SQL. Across a few
hundred geocoded locations that runs in well under a millisecond — in practice
you can't tell the difference.

**One thing to confirm before build starts:** the extension list on whichever
PlanetScale cluster we end up on. If PostGIS is there, we can add proper
geographic indexing later without changing any of the stored coordinates.

### Indexing

- Foreign keys indexed, without exception
- Partial indexes on the hot paths: `WHERE status = 'published'`
- `events (starts_at) WHERE status = 'published' AND starts_at >= now()`
- `events (status, created_at) WHERE status = 'pending_review'` — the review queue
- Partial unique indexes on `(source_id, source_event_uid)` scoped by status (§9)
- GIN on every `search_vector` and on the JSONB columns that get queried
- `tracking_events (occurred_at)`, `(session_id)`, `(name)`

### Connection handling

Cloudflare Workers are short-lived and there can be a lot of them at once, while
Postgres only has so many connections to give. Hyperdrive sits in between and
pools them — the Architecture Plan covers that side. From the schema's point of
view it just means keeping transactions short and pushing anything slow into a
background workflow.

---

## 16. Privacy, PII and retention

MT owns the privacy policy. This section lays out what the schema actually does
with personal data, so the policy can be written against something concrete.

### Where personal data lives

| Table | Fields | Basis | Default retention |
|---|---|---|---|
| `intake_sessions` | `contact_email`, `contact_name`, free-text in `answers` | Explicit consent | **24 months**, then anonymized |
| `referrals` | Linked to a session; `consent_granted_at`, `consent_policy_version` | Consent | 24 months |
| `organization_contacts` | Partner staff name/email/phone | Legitimate interest (business contact) | While partnership is active |
| `users` | Email, name | Account | While account is active + 90 days |
| `tracking_events` | `anon_id` only | Consent / legitimate interest | 25 months |

### Mechanisms in the schema

- **Anonymous by default.** Someone can complete the intake, get routed, and be
  counted in the reporting without giving us any personal information. Contact
  fields only get filled in when a person asks to be contacted or referred.
- **No IP addresses or device fingerprints anywhere.** Cloudflare's analytics
  are cookieless and don't need them. We'd gain nothing by storing them and
  would take on real obligations if we did.
- **A retention date on every row holding personal data**, with a nightly job
  that clears the contact fields and keeps the aggregate. The numbers survive;
  the person stops being identifiable.
- **Deletion on request** — a documented path that removes someone's personal
  details across sessions, answers, referrals and accounts, while leaving the
  anonymized totals intact. MEDC reporting isn't affected.
- **A list of third-party services** that handle any data, kept current, so the
  privacy policy and what's actually running stay in agreement.

### What this doesn't cover

MT still needs to decide and supply the privacy policy text, the lawful basis
statement, the actual retention windows (the ones above are proposals to react
to), and whether intake information can be shared with partner organizations
beyond the referral itself. Those last two shape the final form of the intake
tables — see open question 7.

---

