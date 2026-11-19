# Local proposal review

Start the app with `pnpm dev`, then open `/review` (normally
http://127.0.0.1:5173/review). The development navigation also includes **Review
listings**. No sign-in, token copying or new configuration is needed with the
existing local database.

The page shows a queue alongside the selected proposal's details. Filter by
organization or type, open the source website, and inspect the extracted
description, lane assignments, locations, format, dates, cost and eligibility.
Missing fields are labeled **Not provided**. Event times include the source
timezone. Source text renders as plain text and external links allow only HTTP
or HTTPS URLs without embedded credentials.

Only records with current, non-empty, usable tags appear in this queue. Missing,
failed, rejected or stale tagging stays in ingestion; the page shows a waiting
count without presenting those records for review. This readiness rule is also
enforced by the publication service, including CLI and private RPC calls.

The **Tags** panel groups tags under bold category headings and shows supporting
source evidence and rule/model review flags. Choose **Edit tags** to remove a
suggestion, search the controlled vocabulary by name or meaning, or narrow it by
category. New tags require a supporting source quote. Save changes or cancel;
listing navigation, editing and publication pause while the editor is open.
Saving no selected tags returns the record to ingestion. Approved canonical tags
remain additive in the current prototype.

**Approve & publish** approves the listing and its selected tags in one database
transaction. There is no separate tag-review page or tag approval step. The
service checks both the listing timestamp and the tag proposal ID/timestamp, so
concurrent tag edits cannot be published unseen. Parent, lane or event-date
validation failures roll back tag approval too. Published revisions retain the
canonical record ID/URL and receive the approved tags.

Content edits create a fresh tag snapshot retaining only selections whose exact
source quotes still exist. The previous snapshot remains in the audit history.
Removed evidence drops its tag; if none remain, the record returns to ingestion.

Choose **Approve & publish** or **Reject proposal** for the selected record.
Approval publishes immediately to the configured database; rejection keeps the
record out of the public directory. There are no bulk actions.
Existing published listings have a link for comparison when
reviewing an update.

Use the **pencil** beside a name or field to edit it in place, then choose
**Save** or **Cancel**. Descriptions and longer text use a textarea; formats use
a dropdown. Editable fields include names, summaries, descriptions, costs,
eligibility, program schedules and duration, application/registration links,
and event dates, timezone, venue and city. Organization websites are editable
too. Blank optional fields clear their value. Event dates use native date/time
pickers in the listing's timezone, shown beneath the input. The server converts
them to instants; the browser's timezone does not shift the event. End times
cannot precede start times. Nonexistent or newly ambiguous times at daylight-saving
transitions require correction; an unchanged repeated-hour time preserves its
original instant. Link fields use native URL inputs, formats use dropdowns,
and costs/durations remain text because they may contain fees or descriptive terms.

Saving **does not approve** a proposal. Approval, filtering and navigation pause
while a field is being edited, so unsaved text cannot be published accidentally.
Invalid input stays open for correction. A stale or uncertain save retains the
draft and requires cancelling editing and refreshing before continuing.
Only pending proposals can be edited. Lanes, locations, canonical slugs, source
identities and imported source URLs remain read-only. Source snapshots and
content hashes are preserved so unchanged imports do not undo staff corrections.
New source content can still create a new proposal for review. Saves update
`updated_at` without marking a review decision; approval retains its existing
audit behavior.

Approve an organization's profile before its programs/events. A blocked child
listing has a **Review organization** shortcut when its parent is also awaiting
review. The queue refreshes after each decision and offers a link to the
published page. **Refresh queue** reloads the latest proposals at any time.

The server checks the proposal's exact review timestamp. If a proposal has
changed or was reviewed elsewhere, the action is blocked with an explanation.
Refresh before making another decision. Failed/ambiguous mutation requests are
never retried automatically. If a decision succeeded but refreshing failed, its
success notice remains visible while the queue offers refresh.

The local bootstrap staff identity records decisions in `reviewed_by` and
`reviewed_at`; it is an audit identity, not a signed-in personal account. If the
identity or sources have not been initialized, run `pnpm db:seed` and `pnpm
ingest setup` once. See [ingestion](ingestion.md) for importing more proposals.

## Local-only exception

The user explicitly requested an unauthenticated prototype. Both the page and
review RPC operations are disabled in production builds. The RPC adapter also
requires a loopback hostname, an exact same-origin `Origin` header and JSON
content type. The default dev server binds to `127.0.0.1`. No review API keys or
reviewer IDs are sent to the browser. This is not a remote admin portal.

The existing token-protected `ingestion.*` registry stays unchanged. Only
`review.listProposals`, `review.editProposal` and `review.decideProposal` receive
the local exception; none is an LLM tool. Before a deployed staff portal is built, replace this
local exception with the agreed staff authentication boundary.

## Verification

`pnpm test` checks development/loopback gating, same-origin requests, input
validation, safe failures and exclusion from public tools. `pnpm test:db`
checks the queue, parent-first approval, rejection, stale/duplicate decisions,
safe links and audit identity. `pnpm test:browser` exercises the UI, live public
detail pages after approval, errors/refresh, mobile layout and automated WCAG
checks using its isolated test database. Real local proposals are not approved
by these tests.
