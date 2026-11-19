import { and, eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import {
  organizations,
  offerings,
  events,
  sources,
  users,
  offeringLanes,
} from '../../db/schema'
import { ingestionInputs } from './contracts'

export class ReviewAccessError extends Error {}
export class ReviewConflictError extends Error {}

export async function assertStaff(db: Database, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (
    !user ||
    !['admin', 'mt_staff'].includes(user.platformRole) ||
    user.status !== 'active'
  )
    throw new ReviewAccessError('An active staff reviewer is required')
  return user
}
export async function listProposals(db: Database, sourceId?: string) {
  const orgRows = sourceId
    ? []
    : await db
        .select({
          id: organizations.id,
          slug: organizations.slug,
          name: organizations.displayName,
          summary: organizations.shortDescription,
          description: organizations.longDescription,
          url: organizations.websiteUrl,
          updatedAt: organizations.updatedAt,
        })
        .from(organizations)
        .where(eq(organizations.status, 'pending_review'))
  const programRows = await db
    .select({
      id: offerings.id,
      slug: offerings.slug,
      organizationId: offerings.organizationId,
      name: offerings.name,
      description: offerings.description,
      summary: offerings.summary,
      costText: offerings.costText,
      durationText: offerings.durationText,
      scheduleText: offerings.scheduleText,
      eligibilitySummary: offerings.eligibilitySummary,
      deliveryMode: offerings.deliveryMode,
      applyUrl: offerings.applyUrl,
      url: offerings.url,
      contentHash: offerings.contentHash,
      sourceId: offerings.sourceId,
      sourceRunId: offerings.sourceRunId,
      supersedesId: offerings.supersedesId,
      updatedAt: offerings.updatedAt,
    })
    .from(offerings)
    .where(
      and(
        eq(offerings.status, 'pending_review'),
        sourceId ? eq(offerings.sourceId, sourceId) : undefined,
      ),
    )
  const eventRows = await db
    .select({
      id: events.id,
      slug: events.slug,
      organizationId: events.organizationId,
      name: events.name,
      description: events.description,
      url: events.url,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      timezone: events.timezone,
      costText: events.costText,
      format: events.format,
      venueText: events.venueText,
      city: events.city,
      registrationUrl: events.registrationUrl,
      contentHash: events.contentHash,
      sourceId: events.sourceId,
      sourceRunId: events.sourceRunId,
      supersedesId: events.supersedesId,
      updatedAt: events.updatedAt,
    })
    .from(events)
    .where(
      and(
        eq(events.status, 'pending_review'),
        sourceId ? eq(events.sourceId, sourceId) : undefined,
      ),
    )
  return [
    ...orgRows.map((r) => ({ ...r, type: 'organization' as const })),
    ...programRows.map((r) => ({ ...r, type: 'offering' as const })),
    ...eventRows.map((r) => ({ ...r, type: 'event' as const })),
  ]
}

export async function reviewProposal(
  db: Database,
  input: unknown,
  reviewerId: string,
) {
  const args = ingestionInputs['ingestion.reviewProposal'].parse(input)
  await assertStaff(db, reviewerId)
  return db.transaction(async (tx) => {
    const table =
      args.type === 'organization'
        ? organizations
        : args.type === 'offering'
          ? offerings
          : events
    // Source row first, same lock ordering as the importer. Re-read after taking it.
    if (args.type !== 'organization') {
      const [candidate] = await tx
        .select({
          sourceId:
            args.type === 'offering' ? offerings.sourceId : events.sourceId,
        })
        .from(args.type === 'offering' ? offerings : events)
        .where(eq(table.id, args.id))
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
        'Proposal changed; inspect it again before reviewing',
      )
    const now = new Date()
    if (args.decision === 'reject') {
      await tx
        .update(table)
        .set({ status: 'rejected', reviewedBy: reviewerId, reviewedAt: now })
        .where(eq(table.id, row.id))
      return { id: row.id, status: 'rejected' }
    }
    if (args.type === 'organization') {
      await tx
        .update(organizations)
        .set({
          status: 'published',
          publishedAt: row.publishedAt ?? now,
          reviewedBy: reviewerId,
          reviewedAt: now,
          lastVerifiedAt: now,
        })
        .where(eq(organizations.id, row.id))
      return { id: row.id, status: 'published' }
    }
    const child = row as
      typeof offerings.$inferSelect | typeof events.$inferSelect
    const [org] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, child.organizationId))
    if (org?.status !== 'published')
      throw new ReviewConflictError(
        'Approve the organization profile before publishing its listings',
      )
    if (args.type === 'offering') {
      const p = row as typeof offerings.$inferSelect
      const primary = await tx
        .select()
        .from(offeringLanes)
        .where(
          and(
            eq(offeringLanes.offeringId, p.id),
            eq(offeringLanes.isPrimary, true),
          ),
        )
      if (primary.length !== 1)
        throw new ReviewConflictError(
          'A published offering requires exactly one primary lane',
        )
      if (p.supersedesId) {
        const [current] = await tx
          .select()
          .from(offerings)
          .where(eq(offerings.id, p.supersedesId))
          .for('update')
        if (
          current?.status !== 'published' ||
          current.organizationId !== p.organizationId ||
          current.sourceId !== p.sourceId
        )
          throw new ReviewConflictError(
            'Published record changed; review this proposal again',
          )
        const {
          id,
          createdAt,
          publishedAt,
          slug,
          supersedesId,
          searchVector,
          ...facts
        } = p
        await tx
          .update(offerings)
          .set({
            ...facts,
            status: 'published',
            reviewedAt: now,
            reviewedBy: reviewerId,
            lastVerifiedAt: now,
          })
          .where(eq(offerings.id, current.id))
        const assignments = await tx
          .select()
          .from(offeringLanes)
          .where(eq(offeringLanes.offeringId, p.id))
        await tx
          .delete(offeringLanes)
          .where(eq(offeringLanes.offeringId, current.id))
        await tx
          .insert(offeringLanes)
          .values(assignments.map((a) => ({ ...a, offeringId: current.id })))
        await tx
          .update(offerings)
          .set({ status: 'archived', reviewedAt: now, reviewedBy: reviewerId })
          .where(eq(offerings.id, p.id))
        return { id: current.id, status: 'published', archivedProposalId: p.id }
      }
      await tx
        .update(offerings)
        .set({
          status: 'published',
          publishedAt: now,
          reviewedBy: reviewerId,
          reviewedAt: now,
          lastVerifiedAt: now,
        })
        .where(eq(offerings.id, p.id))
    } else {
      const p = row as typeof events.$inferSelect
      if (!p.startsAt)
        throw new ReviewConflictError('Published events require a start time')
      if (p.supersedesId) {
        const [current] = await tx
          .select()
          .from(events)
          .where(eq(events.id, p.supersedesId))
          .for('update')
        if (
          current?.status !== 'published' ||
          current.organizationId !== p.organizationId ||
          current.sourceId !== p.sourceId
        )
          throw new ReviewConflictError(
            'Published record changed; review this proposal again',
          )
        const {
          id,
          createdAt,
          publishedAt,
          slug,
          supersedesId,
          searchVector,
          ...facts
        } = p
        await tx
          .update(events)
          .set({
            ...facts,
            status: 'published',
            reviewedAt: now,
            reviewedBy: reviewerId,
            lastVerifiedAt: now,
          })
          .where(eq(events.id, current.id))
        await tx
          .update(events)
          .set({ status: 'archived', reviewedAt: now, reviewedBy: reviewerId })
          .where(eq(events.id, p.id))
        return { id: current.id, status: 'published', archivedProposalId: p.id }
      }
      await tx
        .update(events)
        .set({
          status: 'published',
          publishedAt: now,
          reviewedBy: reviewerId,
          reviewedAt: now,
          lastVerifiedAt: now,
        })
        .where(eq(events.id, p.id))
    }
    return { id: row.id, status: 'published' }
  })
}
