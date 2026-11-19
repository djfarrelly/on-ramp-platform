# Taxonomy and matching analysis

Inventory audited November 17, 2026. Implementation updated November 19, 2026.

On-Ramp should keep its four lanes and add a small, shared vocabulary organized
around what a person wants, the help an offering provides, and its actual
subject matter. The implemented vocabulary has **45 broad terms in six independent groups**. Most
listings should need four to six terms. Industry, audience and business stage
are optional refinements. Specific tools, job titles and certification names
remain searchable text until repeated demand justifies a distinct filter.

A résumé describes a person's background. Their stated goal describes the
future they want. Matching must preserve that distinction: an experienced
manufacturing professional who wants to start a consulting business should be
able to find business advice without being restricted to manufacturing courses.

The [tagging workflow](tagging.md) implements the vocabulary and pending
assignment review. AI and data are separate topics following the November 19
decision. Other support-type trade-offs remain accepted. The inventory findings
below describe the November 17 snapshot, before tagging proposals were created.

## Inventory and evidence

The full local inventory contains **61 organizations, 54 offerings and 26 event
records**, with no superseding versions or demo listings in those tables.

| Record type   | Published | Pending review | Rejected | Total |
| ------------- | --------: | -------------: | -------: | ----: |
| Organizations |         8 |             53 |        0 |    61 |
| Offerings     |         7 |             47 |        0 |    54 |
| Events        |         9 |             15 |        2 |    26 |

Published event totals include past dates. Public discovery separately requires
an upcoming start date. Rejected records are part of this audit, not candidates
for matching or automatic reclassification.

Forty organizations have offering records and six have event records. Eighteen
have neither, corresponding to disabled website sources. Their profile text is
not evidence that a particular offering is currently available. Of 61 primary
locations, 41 are labeled Southeast or Detroit Metro and five Statewide. This
inventory reflects bounded imports and regional selection, not the relative
size of Michigan's opportunity markets.

The source workbook contains 122 entity rows, 212 program rows, 211 event rows,
156 course rows and 79 taxonomy terms. These are separate source tables, not
counts to add together as unique opportunities. For example, the Programs tab
includes 12 rows typed as events. The workbook remains unchanged.

Evidence: [inventory audit](taxonomy-inventory-audit-2026-11-17.json),
[source workbook](../context/mi-ecosystem-data.xlsx),
[ingestion runbook](ingestion.md) and the source-specific batch manifests linked
there. The audit used a read-only PostgreSQL transaction and inspected public
listing/classification tables, not personal intake, account or referral data.
It did not recrawl websites or reverify old workbook assertions.

## Current classification and search behavior

The schema already has `tags`, a free-text `group_label`, optional
`parent_tag_id`, and separate organization, offering and event tag joins.
**At the audit there were zero tag definitions and zero assignments.** Organization
and offering lane assignments exist, but recent imports use provisional
source-level defaults. Events have no lane join and discovery uses the host
organization's lanes.

The ordinary directory can match organization/offering tag labels in text
search. Conversational discovery currently searches listing text and supports
only query, lane, region, delivery mode and record type. It does not read tag
joins or support goal, audience, business-stage, cost or eligibility facets.
Adding tag rows alone would therefore not improve conversational matching.
There is no résumé upload/parser in the current discovery flow.

The discovery keyword helper drops words of two characters or fewer, including
`AI` and `IT`. A controlled phrase/alias layer must preserve these terms before
they reach search. `PM` needs context rather than an unconditional expansion.

Implementation evidence: [schema](../src/db/schema/index.ts),
[directory service](../src/services/directory/index.ts),
[discovery service](../src/services/discovery/index.ts),
[intent helper](../src/services/discovery/intent.ts), and
[discovery contracts](../src/lib/discovery-contracts.ts).

## Data issues that affect matching

| Field or distinction               |       Current coverage | Matching consequence                                                                         |
| ---------------------------------- | ---------------------: | -------------------------------------------------------------------------------------------- |
| Offering kind                      | 54 of 54 are `program` | Courses, consulting, funding and resource portals are indistinguishable by kind              |
| Offering delivery mode             |                0 of 54 | Explicit online/in-person filters cannot identify offerings from this field                  |
| Event format                       |                0 of 26 | Virtual events cannot reliably pass a format filter                                          |
| Offering cost text                 |                4 of 54 | Most budget comparisons need additional evidence                                             |
| Offering/event free-status boolean |                0 of 80 | Missing prices cannot be treated as free                                                     |
| Offering eligibility summary       |               10 of 54 | Suitability cannot establish eligibility                                                     |
| Offering duration / schedule       |            3 / 1 of 54 | Time-commitment filters would be incomplete                                                  |
| Event type / linked offering       |            0 / 0 of 26 | Event purpose and relationship to an ongoing program need review                             |
| Organization type / aliases        |            0 / 0 of 61 | The schema supports both, but imports have not populated them                                |
| Offering-specific location joins   |                0 of 54 | Search falls back to provider locations, which are not necessarily delivery or service areas |

Listing descriptions contain some of these facts even when structured fields
are empty. GRCC Computer Support Technician explicitly says it is entirely
online; Henry Ford's ACSP description says in-person and $325; Michigan Works!
Southeast webinar names indicate online delivery. These are extraction/review
gaps, not reasons to invent a second set of format tags.

The importer currently hardcodes offering kind to `program`. Its calendar
extractor preserves dates and venue text but does not populate event format.
Source configuration can extract delivery mode for HTML listings, but the
current inventory has none populated. Fix those paths before relying on new
filters, preserving pending-review and published-record replacement behavior.

The workbook also needs normalization before it can seed trustworthy tags:

- Its 79 terms comprise 39 topics, 19 roles, six career-stage terms, eight
  eligibility terms and seven formats. Topics range from broad subjects to
  tools, credentials and combinations such as “AI for Healthcare.”
- All entity and program topic/role tag columns are empty. Events also have no
  topic or role assignments. Only 43 of 156 course rows have those assignments,
  and **all 43 include Project Manager**. Treat that as a review concern, not
  proof these courses are restricted to or primarily intended for that role.
- Synonyms overlap. `veteran` means both an experienced professional and a
  benefits-related term. `leadership` maps to a topic and executive stage.
  `scrum` does not establish that a person is a Scrum Master. The workbook's
  4–10 and 10+ experience-year bands overlap at ten years.
- Program “format” values mix delivery with consulting, capital, membership,
  application requirements and workspace. These belong in different fields.
- Forty-three course provider IDs and 75 event host references do not exactly
  join to the Entities IDs; the event figure includes two blanks. These need
  identity resolution, not automatic creation of duplicate organizations.
- Workbook event verification dates are April 27 or April 30, 2026. Only 32
  event rows have `next_date`. Recurrence/window descriptions are not confirmed
  upcoming occurrences.

## Proposed groups and starting vocabulary

Keep the lanes as broad navigation. A tag belongs to one group and can apply
across lanes. Avoid a deep hierarchy and combinatorial terms such as “AI for
healthcare project managers.” That query can combine a topic, industry and
confirmed user context.

| Group              | Question                                 | Initial terms                                                                                                                                                                                                                                                                                                   |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal — 9           | What do you want to accomplish?          | Find a job; Change careers; Return to work; Advance into leadership; Build skills or earn a credential; Explore or start a business; Grow a business; Find business funding; Build professional connections                                                                                                     |
| Support — 8        | What kind of help is available?          | Training & education; Coaching & advice; Job search & employer connections; Networking & community; Incubation & acceleration; Funding & financial assistance; Workspace & prototyping; Resources & tools                                                                                                       |
| Topic — 11         | What would you like to learn or work on? | Artificial intelligence; Data & analytics; Software, IT & cybersecurity; Digital workplace skills; Leadership & communication; Project & process management; Business planning & strategy; Marketing & sales; Finance & financial literacy; Product design & commercialization; Technical & occupational skills |
| Industry — 8       | Is there a relevant industry focus?      | Manufacturing & hardware; Mobility & transportation; Energy & environment; Healthcare & life sciences; Software & digital technology; Education; Government & public service; Retail, food & local services                                                                                                     |
| Audience — 5       | Who is this designed to serve?           | Individuals & professionals; Founders & aspiring entrepreneurs; Business owners & operators; Employers & teams; Students & enrolled learners                                                                                                                                                                    |
| Business stage — 4 | Where is the business, if relevant?      | Exploring an idea; Starting & validating; Operating & growing; Scaling & expanding                                                                                                                                                                                                                              |

The [implemented vocabulary](taxonomy-proposal.json) defines every term and its
boundaries. Assignments remain pending until individually reviewed. Search phrases are retrieval
hints, not instructions to assign a fact whenever a word appears.

Only goal, support and topic need prominent exposure at first. Offer industry,
audience and business stage when useful to the question. Never require every
listing to fill all six groups. Keep career years, detailed job families and
learning levels out of the first controlled vocabulary. The workbook and
source text can support later refinements after a trial demonstrates demand.

Organization type remains its own lookup, not an additional visitor tag group.
An organization being a university does not make every offering education-sector
specific. Software use does not make a business a technology-sector business.

## Structured facts that stay separate

Use the existing fields for delivery, price, dates, access conditions and
prerequisites. Record missing facts as unknown. Several distinctions will need
small, explicit schema/contract extensions when implemented:

| Fact                   | Proposed treatment                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cost                   | Preserve source text and currency amounts; verified free / paid / conditional / unknown. WCC's resident-dependent fee is conditional, not universally free           |
| Delivery               | In-person / online / hybrid / self-paced, plus known live-versus-asynchronous detail when it matters; normalize event `virtual` and offering `online` in the service |
| Access and eligibility | Separate intended audience from actual enrollment, residency, application, employer or other requirements; preserve source conditions verbatim                       |
| Geography              | Separate provider address, venue, delivery reach and eligibility service area; keep UI region aliases in the service                                                 |
| Credential             | Exact credential and whether the offering prepares for an exam, awards a credential or merely mentions one                                                           |
| Availability           | Source-confirmed application window or event dates; never infer an open cohort from an evergreen program page                                                        |
| Time                   | Preserve exact duration/schedule, then add a few useful bands only after enough data is reliable                                                                     |

The current `access_level` enum mixes cost and access conditions, and a single
value cannot represent several simultaneous requirements. Avoid extending that
mix with more overlapping flags. Start with the source eligibility summary;
normalize common requirements separately when they are actually used in
matching. Do not auto-fill demographic or benefit eligibility from a résumé.

## Examples from the actual inventory

These are proposed classifications, not applied assignments. Pending examples
remain unavailable to public matching until reviewed.

| Actual listing                                               | Useful proposed classification                            | Fact that must remain separate                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| GRCC Computer Support Technician — published                 | Build skills; Training; Software/IT                       | Description says online; database delivery mode is empty                                                                    |
| HFC Apple Certified Support Professional — pending           | Build skills; Training; Software/IT                       | $325, 24 hours, in-person; distinguish exam preparation from credential award                                               |
| Motor City Match Cash Track — pending                        | Business funding; Financial assistance; Business owners   | Funding conditions and application availability; a grant is not guaranteed                                                  |
| Motor City Match Plan Track — pending                        | Start a business; Training/coaching; Business planning    | Detroit-resident and award/application conditions                                                                           |
| WCC 5-Month Bootcamp — pending                               | Start a business; Training/coaching; Business planning    | Hybrid evenings, enrollment/age conditions, resident-based fees and prior-participation restrictions                        |
| Velocity Accelerator — pending                               | Grow a business; Acceleration; Scaling stage              | Source says businesses have or are positioned to reach $1M annual revenue; do not turn this into a different hard threshold |
| Wayne State Executive and Professional Development — pending | Advance leadership; Training; Leadership; Employers/teams | Employer-customized service, not proof of an individually bookable class                                                    |
| Kettering Innovation and Entrepreneurship Minor — pending    | Start a business; Training; Business planning; Students   | Degree-seeking enrollment context                                                                                           |
| Michigan Works! Southeast Resume Strategies — pending        | Find a job; Job search support/training                   | Confirmed dated webinar; no inferred career gap or occupation                                                               |
| Purpose Jobs Slack community — pending                       | Professional connections; Community; Individuals          | Public resource landing page, not scraped member content or individual vacancies                                            |

Some listings need a content check before classification. The GRCC welding
text includes a beneficiary-story reference to veterans benefits, which is not
proof all learners qualify. A “Women in Tech” event explicitly says it is open
to all, including students. A refugee-only WorkREADY event has a different,
explicit access restriction. Audience names and isolated keyword mentions must
not become eligibility decisions.

## Matching with a résumé or selected wants

Both inputs should produce the same small, editable preference structure:
current background, skills already held, skills wanted, desired outcome, type
of help, location/format/budget/time preferences, and any volunteered facts
needed to evaluate a specific requirement. Background and goals must remain
separate. Current industry, job title, employment gaps and years of experience
must not silently become required filters or eligibility conclusions.

1. Let a person choose a goal and optional help/topic directly. A résumé can
   suggest background and transferable skills for confirmation. Ask what they
   want next rather than treating their last job as their destination.
2. Retrieve only published current records and upcoming event occurrences.
   Preserve explicit hard constraints. If format or price is unknown, the
   result cannot be presented as satisfying “online only” or “free only.”
   Explain the missing fact and offer a separate unconfirmed option only when
   the person chooses to see it.
3. Rank direct goal/help matches first, then desired-topic fit, then relevant
   confirmed background or business stage. Use freshness and result diversity
   as tie-breakers. A résumé skill already mastered is not evidence someone
   wants an introductory course in it.
4. Treat several optional interests as ranking signals. Within a facet, use OR
   for alternatives unless the person explicitly requires both. Do not require
   all six facets to overlap. A general job-search workshop can be a labeled
   fallback for a return-to-work goal without claiming it is a specialized
   returnship.
5. Explain matches with listing facts: “Resume workshop on November 18” or
   “Mentoring for an early-stage business.” Say which eligibility conditions
   still need checking. Avoid a percentage that implies a validated assessment.
6. Limit repeated occurrences of the same event series so three coaching dates
   do not consume an entire first result page. Prefer actionable offerings and
   events, with organization profiles available for broader exploration.

For example, a person with manufacturing operations experience who chooses
“start a business” could receive WCC exploration or startup coaching when the
record is published and its constraints fit. A professional choosing “learn
AI for my existing work” could receive AI training rather than basic computer
literacy solely because both use computers. An employer choosing “train my
team” should see OCC or Wayne's custom services, with individual courses
ranked separately.

A future résumé flow should be optional and ephemeral by default, with explicit
user control of any provider transmission. Retain only confirmed structured
preferences for the session. Do not persist the raw résumé or send names,
contact information and unrelated personal details into matching prompts or
telemetry. Keep the existing no-payload-logging, bounded-tool and fallback
requirements. Résumé ingestion is a separate implementation, not already
supported by the current 600-character message contract.

## Keeping the vocabulary maintainable

Use a versioned list with stable slugs, definitions, inclusion/exclusion
examples and reviewed phrase mappings. No ingestion source or model should
create new tags. Deactivate/merge terms without silently reusing their identity.
Record source evidence, proposal/review state, reviewer and vocabulary version
on each assignment when that workflow is implemented; the current join tables
only store membership and cannot provide this audit trail.

Normally assign one primary goal, one primary support type and one or two
primary topics. Add an audience, industry or business stage only when it changes
matching and the source supports it. Start with a maximum of eight reviewed tags
per listing and flag exceptions rather than filling every category. Untagged
means unclassified, not unsupported or ineligible.

Do not inherit provider tags into every offering or event. The City of Detroit's
career portal and Startup Fund need different tags. University-wide summaries
must not override a particular course's requirements. Organization profile tags
can summarize directly verified services for browsing; derived coverage from
children should be labeled as derived.

Keep fine detail in text: ChatGPT, Copilot, Python, Network+, PMI-CPMAI, RAG and
specific occupations can remain exact search phrases. A broad topic match is
useful for recall, while exact phrases should rank more specific results first.
A person asking specifically for Python should not receive every AI offering
as though it teaches Python. Split a tag only when a recurring search need and
reliable source distinctions justify it. As an initial review rule, look for
several independent providers rather than repeated copies of one event.

## Suggested first implementation increment

1. Fix offering-kind classification and delivery extraction; improve cost and
   eligibility capture. Make the same fields editable/reviewable and preserve
   manual edits when sources refresh. Separate extraction version from source
   content identity so unchanged content can be reprocessed deliberately.
2. Trial the vocabulary offline on **24 varied records**: eight career/learning
   offerings, eight entrepreneurship/growth resources and eight events. Include
   employer-only, student-only, conditional-cost, restricted-access and
   ambiguous-title cases. Use a second review pass to reveal disagreements.
3. Evaluate twelve résumé-plus-goal and self-selection scenarios. Include a
   career pivot, return to work, startup funding, basic versus advanced digital
   skills, an employer training request, and hard online/free constraints.
   Check relevance in the first five results, explanation accuracy, constraint
   violations and gaps caused by missing facts. Review can include pending
   data in an offline harness; public discovery must keep its publication gate.
4. Add controlled tag filtering and ranking to the shared services and explicit
   versioned RPC contracts. Keep the model limited to validated vocabulary and
   service-returned IDs. Preserve the deterministic baseline for comparison.
5. Expand assignment review to the rest of the inventory after resolving pilot
   disagreements. Prioritize metadata completeness and consistency over adding
   more vocabulary.

The existing schema can hold a first vocabulary through `group_label`; enforce
its allowed values in shared contracts. A small `tag_categories` table is an
anticipated additive migration if enforcement and administration warrant it.
An alias mapping and assignment-evidence workflow need explicit design because
the current schema does not supply them. PostgreSQL search remains the starting
point. This proposal requires no additional vendor or hosted search service.
