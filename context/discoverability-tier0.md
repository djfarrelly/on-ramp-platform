# On-Ramp — AI discoverability: Tier 0

> Extracted from `onramp-ai-discoverability.md`. Tier 0 only: these are
> architecture decisions that are cheap now and expensive to retrofit.

## Tier 0: the architecture decisions (do these in Phase 1)

### One canonical URL per entity — the single most important thing

Every organization, every program/offering, and every event needs its own stable,
server-rendered, permanent URL:

```
/organizations/michigan-works-southeast
/programs/small-business-navigator-cohort-2026
/events/founder-first-fridays-2026-12-05
```

Not `#/search?lane=entrepreneurship&id=42`. Not a modal over the directory. If an
AI can't produce a URL that resolves to a page about exactly that program, it
will describe the program vaguely or skip it — and On-Ramp gets no click and no
attribution.

This is also what makes the lane/category pages worth having: `/lanes/entrepreneurship`
as a real, rendered, linkable list page is the thing that gets cited for a broad
question, and it funnels to the detail pages.

Slugs must be stable. A program whose URL changes between the beta and launch
loses every citation it earned. Use a slug field in the schema from day one,
never derive the URL from a mutable title.

### Server-rendered HTML with content in the initial response

TanStack Start on Cloudflare already does this — just don't drift into
client-only rendering for the directory. Test with JavaScript disabled: if the
program list is empty, so is every AI answer about it.

This matters more than every clever technique below combined. AI search crawlers
are substantially worse at JS execution than Googlebot.

### Design the search API as tool-shaped operations

Covered in the MCP assessment (not included in this bundle) —
`search_programs(lane, location, stage)` rather than `GET /query?q=`. Free now,
and it's what an MCP server or a partner widget wraps later.

---

