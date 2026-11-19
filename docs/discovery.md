# Hybrid conversational discovery

Run `pnpm dev` and open `/discover`. First, a region panel asks **Where in
Michigan are you looking?** The main conversation remains visible below it,
pushed down and dimmed under a translucent layer. Its controls are inert until
a region is chosen. There is no Anywhere option. Continue opens **What’s your next
move?**, followed by four starting points: starting a business,
learning and training, finding a new role, and connecting with startups.
A text composer stays visible while the conversation scrolls. Buttons update
the thread in place; listing links open in a new tab so browsing preserves the
conversation.

Selections have light press feedback. Loading dots and placeholder cards lead
into a short, staggered reply reveal with smooth scrolling. Fast responses have
a cancellable minimum loading beat of 360 ms to avoid flashing the indicator;
the network request starts immediately. Reduced-motion preferences disable
animations, smooth scrolling and that minimum wait. Start over cancels both
the request and any pending reveal.

## Conversation flow

The opening choices are Southeast Michigan, West Michigan, Mid-Michigan,
Northern Michigan and Upper Peninsula. Southeast includes Detroit Metro and
reveals an optional five-digit ZIP field. ZIP is a UI-only stub: it is not sent
to the server or model, stored, or used for filtering. The selected region lives
only in component memory; refreshing, leaving the page or Start over resets it.
No cookies, browser storage or URL parameters remember a location.

A starting choice immediately searches the selected lane and region and returns
up to three cards. The next question asks about format, then listing type;
location is already answered. Choosing any format or a mix counts as an answer
and prevents the same question being asked again. **Change region** reopens the
panel. Changing the region of an existing conversation makes a deterministic
region-selection turn; changing only the ZIP stub does not make a request.

The wire value `Southeast` covers source location labels `Southeast`,
`Detroit Metro` and `Southeast Michigan`. Mid-Michigan also matches imported
`South Central` locations, including Lansing. Statewide location labels and
reach flags remain eligible alongside online options. These are service-owned
search aliases; source data and canonical URLs are unchanged.

Every response adds a user bubble, a factual card set, and the next question to
the thread. Freeform text and buttons use the same structured preferences.
Earlier card sets remain available; earlier question buttons are disabled.
**Change direction** resets the topic and listing type while keeping location
and format preferences. **Start over** clears the conversation and returns to
the region panel. Enter sends a
message; Shift+Enter adds a line.

Only published canonical listings and published canonical parents appear.
Normal setup contains no demo listings. Explicitly loading `pnpm db:seed:demo`
adds a labeled fixture dataset for manual testing; `pnpm db:clean:demo` removes
it. The dataset switch appears only when demo organizations exist. No empty
reviewed search silently falls back to fictional content. Approve real imports
through the [local review page](review.md).

## Bounded turn coordinator

`src/services/discovery/conversation.ts` is a provider-independent turn loop:

1. Validate an explicit selection or interpret a text message.
2. Apply structured preferences and run the read-only directory tool.
3. Inspect results. If a topic has no matches, try one broader topic search.
4. Return database cards and the next multiple-choice question, or explicit
   recovery choices if nothing matched.

The budget is **at most one model request and two database searches per turn**.
Button selections bypass the interpreter and model configuration entirely.
Freeform text uses one validated `discovery_search` tool call through AI Gateway
when configured, otherwise the readable baseline. Invalid tool arguments,
provider errors and timeouts fall back to that baseline. Database failures
remain errors rather than being presented as an empty inventory.

Automatic broadening removes only topic keywords, preserving lane, region,
format, listing type, publication rules and dataset. Broader cards are labeled
as broader ideas. The response retains requested `filters` separately from
`effectiveFilters`, so alternatives are never represented as exact matches.
Changing a hard preference requires an explicit user choice or text request.

The coordinator chooses questions from structured `completed` state. It does
not run an open-ended model loop, let a model invent recommendations, or send
search results back for generative summarization. Card names, links, facts and
summaries come from database records. Response copy and question choices are
service-owned. `execution` returns safe step names and call counts for testing;
these implementation details are not shown in the public flow.

## Optional low-cost AI path

The default is Cloudflare-hosted
`@cf/ibm-granite/granite-4.0-h-micro`, selected for bounded intent extraction.
Cloudflare lists its [function-calling support and pricing](https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro/).
Use `DISCOVERY_MODEL` to override it with another compatible model enabled on
your Gateway. No new provider account or SDK is required.

Set the existing Worker bindings via `.dev.vars` locally or Wrangler secrets:

```dotenv
CLOUDFLARE_ACCOUNT_ID=<account-id>
AI_GATEWAY_ID=<gateway-id>
CLOUDFLARE_AI_TOKEN=<token>
AI_GATEWAY_SPEND_LIMIT_CONFIGURED=true
# Optional override of the default above:
# DISCOVERY_MODEL=<tool-calling-model>
```

Configure the actual AI Gateway hard spend limit before setting the attestation
flag. The flag and per-turn budget do not enforce a monetary cap. Requests use
Cloudflare’s [chat-completions REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/),
with a 12-second timeout, 500 output tokens, one forced search tool and no
parallel calls. Arguments, tool name and call count are validated. There is no
provider bypass or mutation tool. Credentials are not configured in the current
local setup; this pass tests the model path using injected Gateway responses.
Live model quality and latency still need evaluation after configuration.

## API inputs

`discovery.respond` accepts exactly one of `message` (1–600 characters) or
`selection`, plus optional previous `filters`, `completed`, `dataset` and
`approach`. `completed` is a unique list of at most four step names: `goal`,
`region`, `format`, `kind`. It records optional answers without requiring a
session or storing a transcript.

Selections are strict typed objects:

```json
{ "selection": { "type": "goal", "value": "entrepreneurship" } }
```

```json
{
    "selection": { "type": "region", "value": "West Michigan" },
    "filters": {
        "query": "",
        "lane": "entrepreneurship",
        "region": null,
        "deliveryMode": null,
        "kind": "all"
    },
    "completed": ["goal"]
}
```

Other selection types are `format` (delivery mode or null), `kind` (listing
type), and `clear-topic`. A null region/format is an explicit unrestricted
answer; a null goal means explore all lanes. Choice labels and follow-up
questions come from the server. The model cannot choose the dataset or search
budget. `discovery.search` remains the independent read-only search method
(maximum six results) for other service consumers.

## Search and privacy

Topic words use parameterized English full-text OR search. Lane is a hard
filter; programs use their own assignments and events use the parent’s lanes.
Online includes online/self-paced programs and virtual events. Unknown formats
do not satisfy explicit filters. Organizations are omitted when a delivery
format is specified. Future events require a start date. Region uses explicit
program locations before organization fallback and includes remote programs.
Search matches do not determine eligibility.

The UI retains at most eight exchanges in React memory, including earlier
cards. Reloading clears them. Requests send only the latest message/selection,
structured preferences and completed steps; no transcript is sent to the model.
No conversations, analytics events, cookies or browser storage are written by
discovery. The router’s sessionStorage scroll positions contain no messages.
POST responses use `Cache-Control: no-store`. Gateway payload logging and
caching are disabled; keep model-provider retention consistent. Worker
observability remains disabled. Private review/ingestion methods are never
part of the discovery tool registry.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm test:db
pnpm build
pnpm test:browser
```

Tests cover exact choice application without model calls, optional answers,
text/button context, bounded re-planning, publication visibility, safe model
failures, canonical links, retry, history/reset, persistent composer, narrow
screens and automated WCAG 2.1 AA checks. Tests use isolated databases and do
not repopulate or approve listings in the working database. Manual screen-reader
review remains outstanding.
