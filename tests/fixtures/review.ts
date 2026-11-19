import { eq } from 'drizzle-orm'
import type { Database } from '../../src/db/client'
import {
  organizations,
  offerings,
  events,
  users,
  organizationLanes,
  offeringLanes,
  locations,
  lanes,
} from '../../src/db/schema'
import { seedCore } from '../../src/db/seed'
import { localReviewerId } from '../../src/services/ingestion/bootstrap'

export const reviewFixtureIds = {
  organization: '019a7e04-0000-7000-8000-000000000001',
  offering: '019a7e04-0000-7000-8000-000000000002',
  event: '019a7e04-0000-7000-8000-000000000003',
  location: '019a7e04-0000-7000-8000-000000000004',
} as const
export async function seedReviewFixtures(db: Database) {
  await db.transaction(async (tx) => {
    await seedCore(tx)
    const now = new Date()
    await tx
      .insert(users)
      .values({
        id: localReviewerId,
        email: 'local-ingestion-reviewer@onramp.invalid',
        platformRole: 'mt_staff',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    await tx
      .insert(organizations)
      .values({
        id: reviewFixtureIds.organization,
        slug: 'review-test-organization',
        displayName: 'Review test organization',
        shortDescription: 'Test organization summary.',
        longDescription: 'Full organization description for reviewing.',
        websiteUrl: 'https://example.org/',
        status: 'pending_review',
        createdAt: now,
        updatedAt: now,
      })
    const [lane] = await tx
      .select()
      .from(lanes)
      .where(eq(lanes.slug, 'learning-development'))
    await tx
      .insert(organizationLanes)
      .values({
        organizationId: reviewFixtureIds.organization,
        laneId: lane.id,
        isPrimary: true,
      })
    await tx
      .insert(locations)
      .values({
        id: reviewFixtureIds.location,
        organizationId: reviewFixtureIds.organization,
        city: 'Grand Rapids',
        region: 'West Michigan',
        createdAt: now,
        updatedAt: now,
      })
    await tx
      .update(organizations)
      .set({ primaryLocationId: reviewFixtureIds.location })
      .where(eq(organizations.id, reviewFixtureIds.organization))
    await tx
      .insert(offerings)
      .values({
        id: reviewFixtureIds.offering,
        organizationId: reviewFixtureIds.organization,
        kind: 'program',
        slug: 'review-test-program',
        name: 'Review test program',
        summary: 'A program awaiting review.',
        description: 'Practical training with a clear next step.',
        costText: 'Free',
        eligibilitySummary: 'Adults interested in practical skills.',
        deliveryMode: 'online',
        url: 'https://example.org/program',
        status: 'pending_review',
        createdAt: now,
        updatedAt: now,
      })
    await tx
      .insert(offeringLanes)
      .values({
        offeringId: reviewFixtureIds.offering,
        laneId: lane.id,
        isPrimary: true,
        createdAt: now,
      })
    await tx
      .insert(events)
      .values({
        id: reviewFixtureIds.event,
        organizationId: reviewFixtureIds.organization,
        slug: 'review-test-event',
        name: 'Review test event',
        description: 'A workshop awaiting review.',
        startsAt: new Date(Date.now() + 86400000),
        timezone: 'America/Detroit',
        format: 'virtual',
        url: 'https://example.org/event',
        status: 'pending_review',
        createdAt: now,
        updatedAt: now,
      })
  })
}
export async function clearReviewFixtures(db: Database) {
  await db.transaction(async (tx) => {
    await tx
      .delete(offeringLanes)
      .where(eq(offeringLanes.offeringId, reviewFixtureIds.offering))
    await tx
      .delete(offerings)
      .where(eq(offerings.id, reviewFixtureIds.offering))
    await tx.delete(events).where(eq(events.id, reviewFixtureIds.event))
    await tx
      .delete(organizationLanes)
      .where(
        eq(organizationLanes.organizationId, reviewFixtureIds.organization),
      )
    await tx
      .update(organizations)
      .set({ primaryLocationId: null })
      .where(eq(organizations.id, reviewFixtureIds.organization))
    await tx
      .delete(locations)
      .where(eq(locations.id, reviewFixtureIds.location))
    await tx
      .delete(organizations)
      .where(eq(organizations.id, reviewFixtureIds.organization))
  })
}
