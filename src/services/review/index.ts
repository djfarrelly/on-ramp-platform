import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Database } from '../../db/client'
import {
  organizations,
  offerings,
  events,
  sources,
  lanes,
  organizationLanes,
  offeringLanes,
  locations,
} from '../../db/schema'
import { assertStaff, listProposals, reviewProposal } from '../ingestion/review'
import {
  reviewEditInput,
  type ReviewDecisionInput,
} from '../../lib/review-contracts'
import { ReviewConflictError } from '../ingestion/review'
import { formatLocalDateTime, localDateTimeToInstant } from '../../lib/datetime'
import { listReviewTags } from './tags'
import { refreshTagsAfterContentEdit } from '../tagging'

const safeUrl = (value: string | null) => {
  try {
    const url = new URL(value ?? '')
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
export class ReviewEditError extends Error {}
export type ReviewField = {
  label: string
  value: string | null
  href?: string | null
  edit?: {
    key: string
    value: string
    kind: 'input' | 'textarea' | 'select'
    inputType?: 'text' | 'url' | 'datetime-local'
    options?: { value: string; label: string }[]
    hint?: string
  }
}
const field = (
  label: string,
  value: string | null | undefined,
): ReviewField => ({ label, value: value ?? null })
const link = (label: string, value: string | null): ReviewField => ({
  label,
  value,
  href: safeUrl(value),
})
const dateText = (value: Date | null, timeZone: string) => {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone,
    }).format(value)
  } catch {
    return value.toISOString()
  }
}
const path = (type: ReviewDecisionInput['type'], slug: string) =>
  `/${type === 'organization' ? 'organizations' : type === 'offering' ? 'programs' : 'events'}/${slug}`

export async function listReviewQueue(db: Database, reviewerId: string) {
  await assertStaff(db, reviewerId)
  const proposals = await listProposals(db)
  if (!proposals.length) return { items: [], awaitingTagging: 0 }
  const tagSummaries = await listReviewTags(db, proposals)
  const organizationIds = [
    ...new Set(
      proposals.map((p) =>
        p.type === 'organization' ? p.id : p.organizationId,
      ),
    ),
  ]
  const offeringIds = proposals
    .filter((p) => p.type === 'offering')
    .map((p) => p.id)
  const sourceIds = [
    ...new Set(
      proposals.flatMap((p) =>
        p.type !== 'organization' && p.sourceId ? [p.sourceId] : [],
      ),
    ),
  ]
  const [parents, orgLanes, programLanes, places, sourceRows] =
    await Promise.all([
      db
        .select({
          id: organizations.id,
          name: organizations.displayName,
          slug: organizations.slug,
          status: organizations.status,
        })
        .from(organizations)
        .where(inArray(organizations.id, organizationIds)),
      db
        .select({
          organizationId: organizationLanes.organizationId,
          name: lanes.name,
          isPrimary: organizationLanes.isPrimary,
        })
        .from(organizationLanes)
        .innerJoin(lanes, eq(lanes.id, organizationLanes.laneId))
        .where(inArray(organizationLanes.organizationId, organizationIds))
        .orderBy(asc(lanes.sortOrder)),
      offeringIds.length
        ? db
            .select({
              offeringId: offeringLanes.offeringId,
              name: lanes.name,
              isPrimary: offeringLanes.isPrimary,
            })
            .from(offeringLanes)
            .innerJoin(lanes, eq(lanes.id, offeringLanes.laneId))
            .where(inArray(offeringLanes.offeringId, offeringIds))
            .orderBy(asc(lanes.sortOrder))
        : [],
      db
        .select({
          organizationId: locations.organizationId,
          city: locations.city,
          region: locations.region,
          isVirtual: locations.isVirtual,
          isStatewide: locations.isStatewide,
        })
        .from(locations)
        .where(inArray(locations.organizationId, organizationIds)),
      sourceIds.length
        ? db
            .select({ id: sources.id, name: sources.name, url: sources.url })
            .from(sources)
            .where(inArray(sources.id, sourceIds))
        : [],
    ])
  const readyProposals = proposals.filter((p) => tagSummaries.get(p.id)!.ready)
  const items = readyProposals
    .map((p) => {
      const parent = parents.find(
        (o) => o.id === (p.type === 'organization' ? p.id : p.organizationId),
      )!
      const source =
        p.type === 'organization'
          ? null
          : (sourceRows.find((s) => s.id === p.sourceId) ?? null)
      const assignments =
        p.type === 'offering'
          ? programLanes.filter((l) => l.offeringId === p.id)
          : orgLanes.filter((l) => l.organizationId === parent.id)
      const laneText = assignments
        .map((l) => l.name + (l.isPrimary ? ' (primary)' : ''))
        .join(', ')
      const fields: ReviewField[] = [
        field('Summary', p.type === 'event' ? null : p.summary),
        field('Description', p.description),
      ]
      fields.push(field('Lanes', laneText || null))
      let blockedReason: string | null = null
      if (p.type !== 'organization' && parent.status !== 'published')
        blockedReason =
          tagSummaries.get(parent.id)?.ready === false
            ? 'The organization profile is still awaiting ingestion tagging.'
            : 'Approve the organization profile before publishing this listing.'
      if (p.type === 'organization') {
        fields.push(
          field(
            'Locations',
            places
              .filter((l) => l.organizationId === p.id)
              .map((l) =>
                [
                  l.city,
                  l.region,
                  l.isStatewide ? 'Statewide' : null,
                  l.isVirtual ? 'Online' : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              )
              .join('\n') || null,
          ),
        )
      } else if (p.type === 'offering') {
        fields.push(
          field('Format', p.deliveryMode?.replaceAll('_', ' ')),
          field('Cost', p.costText),
          field('Duration', p.durationText),
          field('Schedule', p.scheduleText),
          field('Eligibility', p.eligibilitySummary),
          link('Application link', p.applyUrl),
        )
        if (
          !blockedReason &&
          assignments.filter((l) => l.isPrimary).length !== 1
        )
          blockedReason =
            'This program needs exactly one primary lane before publication.'
      } else {
        fields.push(
          field('Starts', dateText(p.startsAt, p.timezone)),
          field('Ends', dateText(p.endsAt, p.timezone)),
          field('Timezone', p.timezone),
          field('Format', p.format?.replaceAll('_', ' ')),
          field('Venue', p.venueText),
          field('City', p.city),
          field('Cost', p.costText),
          link('Registration link', p.registrationUrl),
        )
        if (!blockedReason && !p.startsAt)
          blockedReason = 'This event needs a start time before publication.'
      }
      fields.push(link('Source page', p.url))
      const editable = (
        label: string,
        key: string,
        value: string | null,
        kind: 'input' | 'textarea' | 'select' = 'input',
        values?: string[],
        hint?: string,
        inputType?: 'text' | 'url' | 'datetime-local',
      ) => {
        const f = fields.find((f) => f.label === label)!
        f.edit = {
          key,
          value: value ?? '',
          kind,
          hint,
          inputType,
          options: values?.map((value) => ({
            value,
            label: value.replaceAll('_', ' '),
          })),
        }
      }
      editable('Description', 'description', p.description, 'textarea')
      if (p.type !== 'event')
        editable('Summary', 'summary', p.summary, 'textarea')
      if (p.type === 'organization')
        editable(
          'Source page',
          'websiteUrl',
          p.url,
          'input',
          undefined,
          undefined,
          'url',
        )
      if (p.type === 'offering') {
        editable('Format', 'deliveryMode', p.deliveryMode, 'select', [
          'in_person',
          'online',
          'hybrid',
          'self_paced',
        ])
        editable('Cost', 'costText', p.costText)
        editable('Duration', 'durationText', p.durationText)
        editable('Schedule', 'scheduleText', p.scheduleText, 'textarea')
        editable(
          'Eligibility',
          'eligibilitySummary',
          p.eligibilitySummary,
          'textarea',
        )
        editable(
          'Application link',
          'applyUrl',
          p.applyUrl,
          'input',
          undefined,
          undefined,
          'url',
        )
      }
      if (p.type === 'event') {
        editable(
          'Starts',
          'startsAtLocal',
          p.startsAt ? formatLocalDateTime(p.startsAt, p.timezone) : null,
          'input',
          undefined,
          `Time in ${p.timezone}. Blank clears the date.`,
          'datetime-local',
        )
        editable(
          'Ends',
          'endsAtLocal',
          p.endsAt ? formatLocalDateTime(p.endsAt, p.timezone) : null,
          'input',
          undefined,
          `Time in ${p.timezone}. Blank clears the date.`,
          'datetime-local',
        )
        editable('Timezone', 'timezone', p.timezone)
        editable('Format', 'format', p.format, 'select', [
          'in_person',
          'virtual',
          'hybrid',
        ])
        editable('Venue', 'venueText', p.venueText)
        editable('City', 'city', p.city)
        editable('Cost', 'costText', p.costText)
        editable(
          'Registration link',
          'registrationUrl',
          p.registrationUrl,
          'input',
          undefined,
          undefined,
          'url',
        )
      }
      const publishedId = p.type === 'organization' ? null : p.supersedesId
      return {
        id: p.id,
        type: p.type,
        name: p.name,
        updatedAt: p.updatedAt.toISOString(),
        organizationId: parent.id,
        organizationName: parent.name,
        parentProposalId:
          parent.status === 'pending_review' &&
          tagSummaries.get(parent.id)?.ready
            ? parent.id
            : null,
        blockedReason,
        fields,
        tags: tagSummaries.get(p.id)!,
        sourceName: source?.name ?? null,
        sourceUrl: safeUrl(source?.url ?? p.url),
        isUpdate: Boolean(publishedId),
        // Current canonical records retain the proposal's slug in this model.
        currentPath: publishedId ? path(p.type, p.slug) : null,
      }
    })
    .sort(
      (a, b) =>
        a.organizationName.localeCompare(b.organizationName) ||
        (a.type === 'organization' ? 0 : 1) -
          (b.type === 'organization' ? 0 : 1) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )
  return { items, awaitingTagging: proposals.length - readyProposals.length }
}

export async function editReviewProposal(
  db: Database,
  input: unknown,
  reviewerId: string,
) {
  const args = reviewEditInput.parse(input)
  await assertStaff(db, reviewerId)
  return db.transaction(async (tx) => {
    const table =
      args.type === 'organization'
        ? organizations
        : args.type === 'offering'
          ? offerings
          : events
    // Match importer and decision lock ordering, so a save cannot race an import.
    if (args.type !== 'organization') {
      const childTable = args.type === 'offering' ? offerings : events
      const [candidate] = await tx
        .select({ sourceId: childTable.sourceId })
        .from(childTable)
        .where(eq(childTable.id, args.id))
      if (candidate?.sourceId)
        await tx
          .select()
          .from(sources)
          .where(eq(sources.id, candidate.sourceId))
          .for('update')
    }
    const [row] = await tx
      .select()
      .from(table)
      .where(eq(table.id, args.id))
      .for('update')
    if (!row || row.status !== 'pending_review')
      throw new ReviewConflictError(
        'Proposal is missing or has already been reviewed',
      )
    if (row.updatedAt.getTime() !== Date.parse(args.expectedUpdatedAt))
      throw new ReviewConflictError(
        'Proposal changed; refresh the queue before saving your edits',
      )
    if (args.type === 'organization') {
      const { name, summary, description, ...rest } = args.changes
      await tx
        .update(organizations)
        .set({
          ...rest,
          ...(name !== undefined ? { displayName: name } : {}),
          ...(summary !== undefined ? { shortDescription: summary } : {}),
          ...(description !== undefined
            ? { longDescription: description }
            : {}),
        })
        .where(eq(organizations.id, args.id))
    } else if (args.type === 'offering') {
      await tx
        .update(offerings)
        .set(args.changes)
        .where(eq(offerings.id, args.id))
    } else {
      const current = row as typeof events.$inferSelect
      const { startsAt, endsAt, startsAtLocal, endsAtLocal, ...rest } =
        args.changes
      const timeZone = rest.timezone ?? current.timezone
      const local = (value: string | null, previous: Date | null) => {
        try {
          return value
            ? localDateTimeToInstant(value, timeZone, previous)
            : null
        } catch (error) {
          if (error instanceof RangeError)
            throw new ReviewEditError(error.message)
          throw error
        }
      }
      const start =
        startsAtLocal !== undefined
          ? local(startsAtLocal, current.startsAt)
          : startsAt === undefined
            ? current.startsAt
            : startsAt
              ? new Date(startsAt)
              : null
      const end =
        endsAtLocal !== undefined
          ? local(endsAtLocal, current.endsAt)
          : endsAt === undefined
            ? current.endsAt
            : endsAt
              ? new Date(endsAt)
              : null
      if (start && end && end < start)
        throw new ReviewEditError('End time must be on or after the start time')
      await tx
        .update(events)
        .set({
          ...rest,
          ...(startsAt !== undefined || startsAtLocal !== undefined
            ? { startsAt: start }
            : {}),
          ...(endsAt !== undefined || endsAtLocal !== undefined
            ? { endsAt: end }
            : {}),
        })
        .where(eq(events.id, args.id))
    }
    // The DB updates the timestamp and search vector. Keep ingestion hashes and
    // provenance intact: unchanged source evidence must not undo staff corrections.
    await refreshTagsAfterContentEdit(tx, args.type, args.id, reviewerId)
    return { id: args.id, status: 'pending_review' as const }
  })
}
export type ReviewQueue = Awaited<ReturnType<typeof listReviewQueue>>
export type ReviewQueueItem = ReviewQueue['items'][number]

export async function decideReviewProposal(
  db: Database,
  input: ReviewDecisionInput,
  reviewerId: string,
) {
  const result = await reviewProposal(db, input, reviewerId)
  if (result.status !== 'published') return { ...result, publishedPath: null }
  const table =
    input.type === 'organization'
      ? organizations
      : input.type === 'offering'
        ? offerings
        : events
  const [row] = await db
    .select({ slug: table.slug })
    .from(table)
    .where(and(eq(table.id, result.id), eq(table.status, 'published')))
  return { ...result, publishedPath: row ? path(input.type, row.slug) : null }
}
