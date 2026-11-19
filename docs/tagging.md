# Tagging and review

The first tagging implementation uses **45 controlled tags in six groups**, with
**Artificial intelligence** and **Data & analytics** as separate topics. Other
support-type trade-offs remain as approved. The runtime vocabulary is
`src/lib/tagging-vocabulary.json`; each term has an explicit stable ID, slug,
group and definition. Never renumber IDs when reordering or extending the list.

Tagging generates proposals, not publication decisions. A person reviews each
record and its source passages before any canonical tag joins are written.
Neither generating nor approving tags publishes an organization, offering or
event. Rejected, archived, stale, superseded and fictional listings are excluded
from sampling. Pending listings can be classified without becoming public.

## Run the local pilot

```sh
pnpm db:migrate
# Existing ingestion setup supplies the local staff reviewer; do not re-seed demo data.
pnpm tagging candidates
pnpm tagging run --mode deterministic --limit 55 --seed tagging-pilot-v1
pnpm tagging run --mode hybrid --limit 55 --seed tagging-pilot-v1
pnpm tagging report --run RUN_UUID --output .data/tagging/review.json
pnpm dev
```

Open **[Review listings](http://127.0.0.1:5173/review)**. Tagging is an ingestion
stage, before human review: fetch → extract → propose → tag → review → publish.
The queue contains only records with current, usable, non-empty tag selections.
Failed tagging and abstentions remain in ingestion, with a waiting count on the
review page. Do not force a generic tag merely to satisfy readiness.

Each record includes grouped tags, source evidence and any review flags. Use
**Edit tags** to remove suggestions, search or filter the controlled vocabulary,
and add a supported tag with an exact quote. Save the changes, then choose
**Approve & publish** once for the listing and tags together. Both decisions are
atomic and individual. There is no separate tag-review page or bulk approval.
The previous tagging runs and CLI reports remain available for audit.

Organization setup runs rules-only tagging. Each source import also tags pending
records for that provider, using the provider-neutral model port when configured.
Without Gateway settings it uses rules only; use `INGEST_TAGGING_MODE=hybrid` to
require model configuration or `deterministic` to explicitly select rules. A model
failure never promotes a rule fallback to review readiness. No direct-provider
exception is enabled for ingestion.

Backfill unprocessed pending records or deliberately retry held records:

```sh
pnpm ingest tag-pending
pnpm ingest tag-pending --retry
```

Ready records are preserved. Without `--retry`, unchanged failed/empty proposals
are retained rather than regenerated repeatedly. Gateway routing and spend caps
are required for hybrid inference. No tagging step publishes a listing.

The stable sample favors offerings over umbrella profiles and rotates among
providers. With sufficient inventory, the default 55 records comprise 33
offerings, 11 events and 11 organization profiles. Reusing the seed and unchanged
candidate IDs selects the same records for the rule baseline and hybrid pass.
Selection is stored on each run. This is a review pilot, not an accuracy claim
or a held-out evaluation set. Event classification can include historical
occurrences; public discovery independently enforces upcoming dates.

A generated report contains public listing snapshots and structured suggestions,
not credentials or model request/response dumps. Local reports are ignored by
Git. The CLI prints the run ID and safe usage metadata.

## First completed pilot — November 19, 2026

The [pilot audit](tagging-pilots/2026-11-19.json) records **55 records across 49
providers**: 33 offerings, 11 events and 11 organization profiles. The final batch
has **262 suggestions**, **zero generation failures**, two explicit abstentions
and five records with rule/model disagreements for review. All 55 proposals
remain pending. Listing/source fingerprints and canonical tag counts are
unchanged.

The original successful hybrid batch is run
`01a1f4e2-faaf-76e3-a2c8-8a7da8b9872c`. The rule baseline and earlier attempts
remain available in CLI reports for comparison. The user authorized a one-time local direct
OpenAI pilot using their key. No additional Gateway credits were required for
that pilot. Gateway routing remains the default for future runs.

The first pass flagged 11 model results during tag/evidence validation.
The passage-ID adapter repaired ten using 44 cached results. A final bounded
repair reused 54 results with an adapter that also collapses repeated model tag selections. The
pilot covers 55 unique records and used 67 generation calls across those
attempts, with every prior result retained for audit. Schema/evidence success
is not a measurement of semantic tagging accuracy; that is the user's review.

## Model configuration and provider switching

The model adapter uses pinned **Vercel AI SDK** core, OpenAI and OpenAI-compatible
provider packages. No Vercel account, Vercel Gateway or hosting is used.
`createSdkTagger` accepts any SDK `LanguageModel`; services consume a smaller
provider-neutral `TaggingPorts` interface and never import a model SDK.

Default provider configuration in the ignored `.env`:

```dotenv
TAGGING_PROVIDER=openai
TAGGING_MODEL=gpt-4.1-mini
OPENAI_API_KEY=YOUR_OPENAI_KEY
CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID
AI_GATEWAY_ID=YOUR_GATEWAY_ID
CLOUDFLARE_AI_TOKEN=YOUR_GATEWAY_TOKEN
AI_GATEWAY_SPEND_LIMIT_CONFIGURED=true
```

OpenAI calls use the provider-native Cloudflare Gateway endpoint with the
OpenAI key in the request. This bills the OpenAI account and can use its credits;
it does not require a second inference credit balance at Cloudflare. The
Gateway token must be permitted to run that gateway. Configure the actual
spend limit in Cloudflare; the environment flag only attests that configuration.

To select Cloudflare-hosted inference instead, set `TAGGING_PROVIDER=cloudflare`
and `TAGGING_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast`, retaining the Gateway
settings. OpenAI credentials are not used for that provider. Model availability,
pricing and structured-output support should be checked when changing models.
Provider selection and model identity are retained on the run.

The API and web workflow require Cloudflare Gateway routing. A direct OpenAI
adapter exists only for a user-authorized local prototype exception:

```sh
# Requires explicit user approval to depart from the standing Gateway spend-cap rule.
TAGGING_ALLOW_DIRECT_OPENAI=true pnpm tagging run --mode hybrid --limit 55
```

This opt-in is read only by the CLI and refuses non-loopback databases or any
database other than local `onramp`. Do not persist it as a deployment setting.
It has no Gateway-enforced cap; the request count, output size and retries are
bounded by the pilot, but those bounds are not a dollar budget. There is no
automatic direct-provider fallback when the Gateway fails.

## Classification and decision rules

1. Services build a bounded snapshot from the individual record's public name,
   description, summary, eligibility, price, duration, schedule and prerequisites.
   Dedicated contact, intake and account tables and résumés are not inputs.
2. Narrow, versioned regular-expression rules produce a deterministic baseline.
   Rules avoid eligibility or cost conclusions and keep AI separate from data.
3. Hybrid mode makes at most one SDK generation per record, using the full
   allowed vocabulary and strict structured output. It requests up to eight
   tags and allows abstention. Prompt v2 presents numbered source passages and
   requires an evidence ID; the adapter copies the actual quote and field,
   preventing the model from inventing or paraphrasing a supporting quotation.
4. Services validate allowed slugs, duplicate tags, quote grounding and output
   limits. Rule/model disagreements become visible review issues. A model
   failure leaves an explicitly labeled rule-only proposal and marks the run
   partial/failed. It never becomes an approved classification silently.
5. Review validates the same evidence. Adding a reviewer tag requires source
   support. Original suggestions and evidence remain preserved when deselected;
   reviewer-added suggestions are identified separately.
6. Approval locks the entity and proposal, verifies the expected proposal time,
   original record time/content and existing tag-set fingerprint, then adds only
   the selected active tags. It preserves all pre-existing tags. A changed
   tag set or vocabulary requires a fresh proposal. Staff content edits create a
   new audited snapshot, retaining only tags with still-grounded source evidence. Canonical removal
   of previously approved tags is not part of this first additive workflow. The
   listing approval service invokes tag approval inside the same transaction;
   readiness and expected tag proposal timestamps are checked before publication.

Quotes establish traceability, not semantic correctness. Human review is still
needed for incidental mentions, prerequisites versus teaching content, broad
provider descriptions and conditional access. The first pilot intentionally
keeps these trade-offs visible instead of creating additional support types.

Every batch has taxonomy/prompt/model versions, a configuration snapshot,
selected identities, progress and usage counts. `--reuse-run RUN_UUID` preserves the
original selection and reuses only unchanged, validated, unedited pending
results with matching model and taxonomy versions. Failed or changed records
receive new model calls. Each cached proposal records its source run ID;
prompt-v1 validated evidence remains compatible with the passage-ID v2 update. Explicit per-entity foreign
keys connect proposals to organizations, offerings or events. Suggestions use
normalized tag foreign keys. Only reviewed membership reaches the existing
`organization_tags`, `offering_tags` and `event_tags` tables.

SDK telemetry and OpenAI response storage are disabled. Gateway requests set
`cf-aig-collect-log-payload: false` and bypass response caching. Independent
Gateway Logpush and provider-retention settings still need consistent operator
configuration. Errors stored in the database are generic codes, never provider
exceptions or request headers. Model failure does not affect directory access.

## API methods

All methods use `POST /api/v1/<method>` with JSON and share the same service
functions as the CLI. For this user-approved local prototype increment, they
require a development build, loopback hostname, matching Origin and initialized
active local staff reviewer. Production and non-loopback requests return 404.
There are no public or conversational tools for tagging.

| Method                     | Input                                                          | Purpose                                                                               |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `tagging.listVocabulary`   | `{}`                                                           | Six groups and their controlled terms                                                 |
| `tagging.listCandidates`   | `{}`                                                           | Eligible public listing identities                                                    |
| `tagging.runBatch`         | `mode?`, `limit?` (1–60), `seed?`, `recordIds?`, `reuseRunId?` | Generate a bounded batch; default hybrid, 55 records                                  |
| `tagging.getRun`           | `runId`                                                        | Version/configuration/progress metadata                                               |
| `tagging.listProposals`    | `runId?`                                                       | Review details for a selected/latest run                                              |
| `tagging.openRecordReview` | `type`, `id`                                                   | Open a current pending proposal or prepare a rules-only draft for one eligible record |
| `tagging.editProposal`     | `proposalId`, `expectedUpdatedAt`, `assignments`, `note?`      | Select/correct pending tags with source quotes                                        |
| `tagging.decideProposal`   | `proposalId`, `expectedUpdatedAt`, `decision`, `note?`         | Individually approve or reject tags                                                   |

An assignment is `{ slug, field, quote }`; field is one of `name`, `description`,
`summary`, `eligibility`, `cost`, `duration`, `schedule`, `prerequisites`.
Unknown properties and tags are rejected. Decisions are `approve` or `reject`.
CLI equivalents for review accept structured JSON without exposing a general
query executor:

```sh
pnpm tagging edit --file .data/tagging/edit.json
pnpm tagging decide --proposal UUID --expected ISO_TIMESTAMP --decision approve
```

The HTTP run method is synchronous and local-only. Use the CLI for the pilot.
A remote durable run dispatcher and authenticated staff portal remain future
work. An interrupted run retains completed proposals and a `running` audit row;
inspect its report and start a new batch deliberately. There is no automatic
retry, cron, bulk publication or background resume.

The ordinary directory already searches approved organization/offering tag
labels. Conversational discovery's tag-aware ranking and new facet controls
remain a separate matching increment. This implementation supplies the reviewed
classifications; it does not claim to implement résumé parsing or new search
preferences.

## References and validation

- [AI SDK structured outputs](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- [OpenAI-compatible provider adapter](https://ai-sdk.dev/providers/openai-compatible-providers)
- [Cloudflare OpenAI key-in-request routing](https://developers.cloudflare.com/ai-gateway/usage/providers/openai/)
- [Taxonomy analysis](taxonomy-analysis.md)

Unit and isolated database tests cover split topics, evidence and schema
validation, repeatable sampling, Gateway routing, local RPC gates, unpublished
proposals, reviewer corrections, stale decisions, preservation of canonical
assignments and labeled model failure. Isolated browser tests cover editing,
individual approval without publication, mobile layout and automated WCAG checks.
