import { and, desc, eq, inArray, or } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { tagFingerprint } from './classify'
import {
  taggingDefinitions,
  taxonomyVersion,
} from '../../lib/tagging-contracts'
import { tagGroupNames } from '../../lib/tag-presentation'
import {
  tags,
  organizationTags,
  offeringTags,
  eventTags,
  taggingProposals,
  taggingSuggestions,
  taggingRuns,
} from '../../db/schema'

type Listing = {
  id: string
  type: 'organization' | 'offering' | 'event'
  updatedAt: Date
}
type ReviewTag = {
  slug: string
  label: string
  group: string
  field?: string
  quote?: string
}
type TagSummary = {
  approved: ReviewTag[]
  suggested: ReviewTag[]
  status: string | null
  stale: boolean
  ready: boolean
  reason: string | null
  proposal: { id: string; updatedAt: string } | null
  issues: string[]
}
const groupLabel = (value: string | null) =>
  value ? (tagGroupNames[value] ?? value) : 'Other'

/** Read-only, batched tag context for the listing queue; never inherits parent tags. */
export async function listRecordTagState(db: Database, listings: Listing[]) {
  const result = new Map<string, TagSummary>(
    listings.map((p) => [
      p.id,
      {
        approved: [],
        suggested: [],
        status: null,
        stale: false,
        ready: false,
        reason: 'Tagging has not completed.',
        proposal: null,
        issues: [],
      },
    ]),
  )
  if (!listings.length) return result
  const ids = (type: Listing['type']) =>
    listings.filter((p) => p.type === type).map((p) => p.id)
  const orgIds = ids('organization'),
    offeringIds = ids('offering'),
    eventIds = ids('event')
  const tagColumns = {
    slug: tags.slug,
    label: tags.label,
    group: tags.groupLabel,
    tagId: tags.id,
    active: tags.isActive,
    description: tags.description,
  }
  const [orgs, offerings, events, proposals] = await Promise.all([
    orgIds.length
      ? db
          .select({ entityId: organizationTags.organizationId, ...tagColumns })
          .from(organizationTags)
          .innerJoin(tags, eq(tags.id, organizationTags.tagId))
          .where(inArray(organizationTags.organizationId, orgIds))
      : [],
    offeringIds.length
      ? db
          .select({ entityId: offeringTags.offeringId, ...tagColumns })
          .from(offeringTags)
          .innerJoin(tags, eq(tags.id, offeringTags.tagId))
          .where(inArray(offeringTags.offeringId, offeringIds))
      : [],
    eventIds.length
      ? db
          .select({ entityId: eventTags.eventId, ...tagColumns })
          .from(eventTags)
          .innerJoin(tags, eq(tags.id, eventTags.tagId))
          .where(inArray(eventTags.eventId, eventIds))
      : [],
    db
      .select({
        id: taggingProposals.id,
        organizationId: taggingProposals.organizationId,
        offeringId: taggingProposals.offeringId,
        eventId: taggingProposals.eventId,
        status: taggingProposals.status,
        updatedAt: taggingProposals.updatedAt,
        errorCode: taggingProposals.errorCode,
        tagSetHash: taggingProposals.tagSetHash,
        taxonomyVersion: taggingRuns.taxonomyVersion,
        issues: taggingProposals.issues,
        recordUpdatedAt: taggingProposals.recordUpdatedAt,
      })
      .from(taggingProposals)
      .innerJoin(taggingRuns, eq(taggingRuns.id, taggingProposals.runId))
      .where(
        or(
          orgIds.length
            ? inArray(taggingProposals.organizationId, orgIds)
            : undefined,
          offeringIds.length
            ? inArray(taggingProposals.offeringId, offeringIds)
            : undefined,
          eventIds.length
            ? inArray(taggingProposals.eventId, eventIds)
            : undefined,
        ),
      )
      .orderBy(desc(taggingProposals.createdAt), desc(taggingProposals.id)),
  ])
  for (const row of [...orgs, ...offerings, ...events]) {
    if (!row.active) continue
    result.get(row.entityId)!.approved.push({
      slug: row.slug,
      label: row.label,
      group: groupLabel(row.group),
    })
  }
  const latest = new Map<string, (typeof proposals)[number]>()
  for (const p of proposals) {
    const id = (p.organizationId ?? p.offeringId ?? p.eventId)!
    if (!latest.has(id)) latest.set(id, p)
  }
  const pendingIds: string[] = []
  const proposalEntities = new Map<string, string>()
  for (const listing of listings) {
    const p = latest.get(listing.id)
    if (!p) continue
    const summary = result.get(listing.id)!
    summary.status = p.status
    summary.issues = p.issues as string[]
    summary.proposal = { id: p.id, updatedAt: p.updatedAt.toISOString() }
    summary.stale = p.recordUpdatedAt.getTime() !== listing.updatedAt.getTime()
    if (p.status !== 'pending_review') continue
    pendingIds.push(p.id)
    proposalEntities.set(p.id, listing.id)
  }
  if (pendingIds.length) {
    const suggestions = await db
      .select({
        proposalId: taggingSuggestions.proposalId,
        field: taggingSuggestions.evidenceField,
        quote: taggingSuggestions.evidenceQuote,
        ...tagColumns,
      })
      .from(taggingSuggestions)
      .innerJoin(tags, eq(tags.id, taggingSuggestions.tagId))
      .where(
        and(
          inArray(taggingSuggestions.proposalId, pendingIds),
          eq(taggingSuggestions.isSelected, true),
        ),
      )
    for (const row of suggestions) {
      const definition = taggingDefinitions.find((d) => d.slug === row.slug)
      if (
        !row.active ||
        !definition ||
        row.label !== definition.label ||
        row.description !== definition.definition ||
        row.group !== definition.group
      ) {
        result.get(proposalEntities.get(row.proposalId)!)!.reason =
          'A selected tag definition is unavailable.'
        continue
      }
      result.get(proposalEntities.get(row.proposalId)!)!.suggested.push({
        slug: row.slug,
        label: row.label,
        group: groupLabel(row.group),
        field: row.field,
        quote: row.quote,
      })
    }
  }
  for (const listing of listings) {
    const summary = result.get(listing.id)!
    const p = latest.get(listing.id)
    const canonicalIds = [...orgs, ...offerings, ...events]
      .filter((r) => r.entityId === listing.id)
      .map((r) => r.tagId)
    if (!p) {
      summary.ready = summary.approved.length > 0
    } else if (summary.stale || p.taxonomyVersion !== taxonomyVersion) {
      summary.reason =
        'Tagging needs to be refreshed after a record or vocabulary change.'
    } else if (p.status === 'pending_review') {
      summary.ready =
        summary.reason !== 'A selected tag definition is unavailable.' &&
        !p.errorCode &&
        summary.suggested.length > 0 &&
        p.tagSetHash === tagFingerprint(canonicalIds)
      summary.reason = p.errorCode
        ? 'Tagging failed; retry ingestion tagging.'
        : 'No usable tags were selected.'
    } else if (p.status === 'approved') {
      summary.ready = summary.approved.length > 0
    } else summary.reason = 'Tagging was rejected; retry ingestion tagging.'
    if (summary.ready) summary.reason = null
  }
  for (const summary of result.values()) {
    for (const list of [summary.approved, summary.suggested])
      list.sort(
        (a, b) =>
          a.group.localeCompare(b.group) || a.label.localeCompare(b.label),
      )
  }
  return result
}
