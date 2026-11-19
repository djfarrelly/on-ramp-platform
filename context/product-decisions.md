# On-Ramp — confirmed product decisions

> Extracted from `onramp-mt-decision-memo.md`. These are client-confirmed
> constraints. Do not design around assumptions that contradict them.

## 1. Lane assignment model

**Confirming an approach.** A record — an organization or a program — can belong
to **several lanes, with one marked primary**. It surfaces in every lane it
genuinely belongs to, and the primary lane drives breadcrumbs, card labels, and
the "which lane did this referral come from" reporting.

**Why.** Your spreadsheet shows most organizations serving three to five
different audiences. Ann Arbor SPARK spans early-stage entrepreneurship,
executive advancement and durable skills. Michigan Founders Fund covers
entrepreneurship and mid-career pivot. A single-lane model would hide genuinely
relevant results from visitors.

The primary designation matters because the cross-lane referral count is one of
the metrics reported to MEDC, and it needs an unambiguous answer to "which lane
did this come from."

I've built the data model this way. Just flag it if you see it differently.

**Helpful by: November 14.**

---

## 2. Sub-categories within the four lanes

**Confirming an approach.** The four lanes stay as the top level of the site.
The `serves` values in your spreadsheet become **sub-categories nested within
them** — a finer-grained layer underneath each lane, used for filtering and for
routing.

So the hierarchy is: four lanes → a small set of sub-categories per lane →
individual organizations and programs. A visitor enters through a lane, and the
sub-category is what actually gets matched during intake.

**The real ask: defining that sub-category list with you.** Today the
spreadsheet has seven `serves` values alongside separate topic, role, format and
audience tag columns, and they don't nest under the four lanes cleanly:

> Mid-career pivot · Technical upskilling · Early-stage entrepreneurship ·
> Growth-stage entrepreneurship · Career re-entry · Executive / leadership
> advancement · Durable skills development

What I'd like to work out together is the final list and how each one maps to a
lane. **Keeping the count low is the goal** — ideally three to five
sub-categories per lane. Too many is the main data quality risk in the whole
build: every additional sub-category is another judgment call for whoever is
tagging a record, which means inconsistent tagging, which means a visitor gets
routed to the wrong place. A tight list that everyone applies the same way beats
a comprehensive one that nobody applies consistently.

This is probably a working session rather than an email — happy to come with a
first-draft mapping to react to if that's useful.

**Helpful by: November 14** — it shapes both the intake questions and the
routing prototype.

---


---

## 7. Privacy posture and policy

**Confirming the goal: the platform stores no personal data by default.**

The intake flow is designed to be anonymous — someone can complete it and be
routed without providing any personal information. We're avoiding PII from the
start rather than collecting it and protecting it: no IP addresses, no device
fingerprints, and cookieless web analytics.

Contact details only get captured where a person explicitly asks to be contacted
or connected to a partner, and only with consent.

**What this needs from you.** A privacy policy that matches that posture.
It should be a short, simple document given how little the platform collects —
and I'm happy to draft a first pass describing what the system actually does, so
you're editing rather than starting from blank.

**Helpful by: December 5** — before intake development begins.

---

## 8. CRM boundary and reference IDs

**Context.** Allyssia mentioned standing up a CRM for relationship management and more sensitive information, with reference IDs between it and the On-Ramp database to avoid duplicating records. I think that's the right call, and the schema is built for it.

**What would help** is clarifying roughly where the line sits.

| Lives in On-Ramp database                        | Lives in Middle Third's CRM                                        |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| Public organization profile, programs, events    | Relationship history, meeting notes, internal assessments          |
| Publicly listed contact details                  | Private staff contacts, personal mobile numbers                    |
| The referral contact who confirms follow-through | Partnership agreements, MOU status, negotiations                   |
| Partner platform logins                          | Anything a partner would be surprised to find on a public platform |
| Referral counts and outcomes                     |                                                                    |

The rule of thumb I'd work from: **if a partner would be surprised to find it in
the public platform's database, it belongs in the CRM.** That keeps the privacy
surface small and keeps each system doing what it's good at.

**Also useful to know:** which CRM you land on, so I can set up a stable
reference ID convention. No integration is proposed for year 1 — just the IDs,
so a future integration doesn't require rework.

**Helpful by: December 5.**

---

