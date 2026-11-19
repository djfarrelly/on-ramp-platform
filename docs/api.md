# API v1: named methods

Prototype decision, November 12, 2026: use a small RPC-style JSON-over-HTTP API.
This supersedes the REST route examples in `context/architecture.md`; the
versioned service boundary remains the contractual commitment.

Every method is `POST /api/v1/<method>` with `Content-Type: application/json`.
Send the input object directly, without JSON-RPC envelopes, batches or a second
method field. Successful responses are `{ "result": ... }`. Errors are
`{ "error": { "code": "INVALID_INPUT", "message": "..." } }` with the
appropriate HTTP status. v1 has no public API keys, cross-origin support or
public widget integration. Its current methods expose published directory data
only. Future authenticated methods require separate authorization.

| Method                          | Input                                                                       | Result                                                      |
| ------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `lanes.list`                    | `{}`                                                                        | Active lanes in display order                               |
| `directory.searchOrganizations` | `query?`, `lane?`, `region?`, `limit?`, `offset?`                           | `{ items, total, limit, offset }`                           |
| `directory.searchOpportunities` | Same, plus `deliveryMode?`                                                  | `{ items, total, limit, offset }`                           |
| `directory.getOrganization`     | `{ slug }`                                                                  | Public profile and its published programs                   |
| `directory.getOpportunity`      | `{ slug }`                                                                  | Public program details and organization link                |
| `directory.getEvent`            | `{ slug }`                                                                  | Public event details and organization link                  |
| `discovery.search`              | Filters below, `dataset?`, `limit?`                                         | Up to six programs, events and organizations                |
| `discovery.respond`             | `message` or `selection`, `filters?`, `completed?`, `dataset?`, `approach?` | Search results, interpreted filters, strategy and follow-up |

```sh
curl http://127.0.0.1:5173/api/v1/directory.searchOpportunities \
  -H 'Content-Type: application/json' \
  -d '{"query":"technical","lane":"learning-development","deliveryMode":"online","limit":5}'
```

Search defaults to 24 results; maximum 50. Query length is bounded at 200
characters, offset at 10,000, and HTTP bodies at 16 KiB. Unknown fields and
methods are rejected. Formats: `in_person`, `online`, `hybrid`, `self_paced`.
Lane slugs: `corporate-careers`, `entrepreneurship`, `startup-ecosystem`,
`learning-development`.

Region matches an explicit location, a statewide/virtual location, or (for
programs) online/self-paced delivery. A program with explicit locations uses
those; otherwise its organization's locations are the fallback. A program and
its parent organization must both be published canonical records to appear.
Multi-lane items appear once. Results are ranked by text relevance with stable
name/ID tie breaking; an empty query sorts by name. Eligibility text is a fact
to display, not an eligibility decision.

Status codes: 400 invalid input, 404 unknown method or missing record, 413 body
too large, 415 wrong content type, 503 database unavailable. Database errors
are not exposed to clients. Responses use `Cache-Control: no-store` for now.

## Reuse as tools

`src/lib/contracts.ts` holds directory schemas and the program-only
`directory_search_opportunities` declaration. The conversational interface uses
`discovery_search` from `src/lib/discovery-contracts.ts`, mapped to
`discovery.search` across programs, events and organizations. Both call the same
services as their HTTP adapters. No HTTP self-call is needed on the server.

Services in `src/services/directory/` contain all filtering, visibility,
ranking and field selection. `src/server/` contains transport adapters and
Worker bindings. The model will never receive a database connection or SQL
execution tool. No agent framework, vector store or additional vendor is
required for this increment.

When intent fields such as stage settle, add validated inputs and documented
search semantics here. Do not let a model invent unsupported filters.

## Discovery methods

See [discovery setup and behavior](discovery.md). Discovery filters are
`{ query, lane, region, deliveryMode, kind }`: all five fields are required by
`discovery.search` and its tool schema. Query is at most 120 characters; lane,
region and deliveryMode may be null. Region is one of Detroit Metro, Southeast,
West Michigan, Mid-Michigan, Northern Michigan, Upper Peninsula. Kind is `all`,
`program`, `event` or `organization`. Limit defaults to six, maximum six.
Dataset is `published` (default, excludes demo fixtures) or `demo` (only fixtures).

`discovery.respond` accepts exactly one of a message (1–600 characters) or a
strict typed selection (`goal`, `region`, `format`, `kind`, `clear-topic`),
previous structured filters, completed steps, dataset and approach (`automatic`
or `deterministic`). Button choices bypass model setup entirely. Each turn
allows at most one model request and two searches; topic-only broadening is
labeled and preserves hard filters. Responses include requested/effective
filters, completed steps, choices, and safe execution counts. Conversation
cards are capped at three. See [the hybrid flow](discovery.md) for input shapes.
There is no transcript or user identity parameter. Response strategy is `ai`,
`deterministic` or `fallback`; model failures return baseline results rather
than provider error payloads. Both endpoints reject explicitly cross-origin
requests with 403 and send no CORS headers. The read-only `discovery_search`
tool cannot choose its own dataset or limit. No ingestion methods are included.

```sh
curl http://127.0.0.1:5173/api/v1/discovery.respond \
  -H 'Content-Type: application/json' \
  -d '{"message":"I want technical training near Grand Rapids","dataset":"demo","approach":"deterministic"}'
```

## Ingestion administration

Tagging has a separate local-only registry under `tagging.*`, using the same
development/loopback/same-origin gate and staff audit identity. Its seven
explicit methods generate bounded proposals, expose evidence and support
individual tag edits/decisions. They never publish listings and are absent from
public model tools. See [tagging methods and runbook](tagging.md#api-methods).

The unauthenticated **local development** review UI has a separate registry:

| Method                  | Input                                                                | Result                                                                       |
| ----------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `review.listProposals`  | `{}`                                                                 | Pending proposals, display facts, safe source links and publication blockers |
| `review.decideProposal` | `type`, `id`, `decision`, `expectedUpdatedAt`, `expectedTagProposal` | Decision status and published canonical path when approved                   |
| `review.editProposal`   | `type`, `id`, `expectedUpdatedAt`, `changes`                         | Saves validated content fields on a pending proposal; never publishes        |

These methods return 404 in production builds or on non-loopback hosts. They
require a matching `Origin` header and JSON request body, use the server-owned
local reviewer identity, and reject reviewer IDs in input. They are excluded
from all public tool declarations. Conflicts return 409; missing local reviewer
setup and safe database failures return 503. See [local review](review.md).

Editing accepts a strict per-type allowlist in `changes`; unknown fields,
unsafe links, invalid timezone/date values and empty patches return 400. It
never accepts status, slug, source identity or reviewer changes. Optional blank
text clears a field. Event dates accept either `startsAt`/`endsAt` (ISO timestamps
with explicit offsets) or `startsAtLocal`/`endsAtLocal` (native date/time values
without offsets, interpreted in the event's timezone). Do not send both forms for
the same field. Null clears a date. Local clock-change gaps or new ambiguous
times return 400. Only the editing method allows a 64 KiB JSON body, to accommodate a
16,000-character description in UTF-8; the other methods keep their 16 KiB limit.
Saving keeps the listing pending and checks `expectedUpdatedAt` before writing.
The review queue includes only records with current, non-empty usable tags and
returns `awaitingTagging` for records still held in ingestion. Publication approves
selected tags in the same transaction. When a tag proposal exists, approvals must
send `expectedTagProposal: { id, updatedAt }` from the queue; stale/missing tag
identity returns 409. The private `ingestion.reviewProposal` uses the same rule.

The same named-method convention is used for private ingestion operations.
These methods are **not** in the public tool registry and are disabled without
explicit bootstrap staff configuration. See [the ingestion runbook](ingestion.md)
for access, CLI equivalents, Workflow/R2 setup and review semantics.

| Method                        | Input                                                             |
| ----------------------------- | ----------------------------------------------------------------- |
| `ingestion.listSources`       | `{}`                                                              |
| `ingestion.configureSource`   | `{ sourceId, config }`                                            |
| `ingestion.recordTermsReview` | `{ sourceId, note }`                                              |
| `ingestion.runSource`         | `{ sourceId, mode?, limit? }`; dispatches a Workflow              |
| `ingestion.getRun`            | `{ runId }`                                                       |
| `ingestion.recoverRun`        | `{ runId }`; only interrupted runs older than one hour            |
| `ingestion.listProposals`     | `{ sourceId? }`                                                   |
| `ingestion.reviewProposal`    | `{ type, id, decision, expectedUpdatedAt, expectedTagProposal? }` |

Review types are `organization`, `offering`, `event`; decisions are `approve`
or `reject`. The authenticated bootstrap reviewer is selected by the server,
never from request-supplied user IDs. Changes to a published record require
review before updating its live content. The CLI calls these same services
directly and uses local database access as its operator boundary.
