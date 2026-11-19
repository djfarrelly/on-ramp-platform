import type { Database } from '../../src/db/client'
import { seedCore } from '../../src/db/seed'
import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  organizations,
  locations,
  organizationLanes,
  organizationTags,
  organizationAliases,
  offerings,
  offeringLanes,
  offeringTags,
  offeringLocations,
  tags,
} from '../../src/db/schema'

// Stable, valid UUIDv7 fixture IDs make seeding repeatable without deleting rows.
export const fixtureId = (n: number) =>
  `019a7e00-0000-7000-8000-${n.toString(16).padStart(12, '0')}`

const orgFixtures = [
  {
    slug: 'motor-city-career-exchange',
    name: 'Motor City Career Exchange',
    city: 'Detroit',
    region: 'Detroit Metro',
    lanes: [0, 3],
    tags: ['Career change', 'Career re-entry'],
    summary:
      'A starting point for career changers, returning workers and people ready to put their experience to work in a new way.',
  },
  {
    slug: 'great-lakes-business-studio',
    name: 'Great Lakes Business Studio',
    city: 'Ann Arbor',
    region: 'Southeast',
    lanes: [1, 2],
    tags: ['Small business', 'Early-stage founders'],
    summary:
      'Practical guidance for taking a business idea from a notebook to a first customer, with support for the questions along the way.',
  },
  {
    slug: 'mitten-founders-collective',
    name: 'Mitten Founders Collective',
    city: 'Grand Rapids',
    region: 'West Michigan',
    lanes: [2, 1],
    tags: ['Early-stage founders', 'Capital readiness'],
    summary:
      'A community where founders can exchange ideas, pressure-test plans and build connections for their next stage.',
  },
  {
    slug: 'lakeshore-skills-lab',
    name: 'Lakeshore Skills Lab',
    city: 'Muskegon',
    region: 'West Michigan',
    lanes: [3, 0],
    tags: ['Technical skills', 'Career change'],
    summary:
      'Hands-on learning and flexible technical training for people building new skills around work and life.',
  },
  {
    slug: 'capital-region-career-bridge',
    name: 'Capital Region Career Bridge',
    city: 'Lansing',
    region: 'Mid-Michigan',
    lanes: [0, 3],
    tags: ['Leadership', 'Career re-entry'],
    summary:
      'Career navigation, leadership development and practical support for finding a new direction in the workplace.',
  },
  {
    slug: 'northwoods-enterprise-hub',
    name: 'Northwoods Enterprise Hub',
    city: 'Traverse City',
    region: 'Northern Michigan',
    lanes: [1, 3],
    tags: ['Small business', 'Business growth'],
    summary:
      'Local connections and business skills for independent workers, new businesses and growing enterprises in Northern Michigan.',
  },
  {
    slug: 'peninsula-launch-workshop',
    name: 'Peninsula Launch Workshop',
    city: 'Marquette',
    region: 'Upper Peninsula',
    lanes: [2, 1],
    tags: ['Early-stage founders', 'Product development'],
    summary:
      'A place for Upper Peninsula makers and founders to test an idea, learn from peers and find their next collaborator.',
  },
  {
    slug: 'riverbend-learning-network',
    name: 'Riverbend Learning Network',
    city: 'Flint',
    region: 'Southeast',
    lanes: [3, 0],
    tags: ['Technical skills', 'Leadership'],
    summary:
      'Short, approachable learning experiences for people who want to strengthen their digital and workplace skills.',
  },
  {
    slug: 'community-business-commons',
    name: 'Community Business Commons',
    city: 'Detroit',
    region: 'Detroit Metro',
    lanes: [1, 2],
    tags: ['Small business', 'Capital readiness'],
    summary:
      'A neighborhood business community for finding a first customer, understanding funding and building a sustainable plan.',
  },
  {
    slug: 'michigan-digital-skills-exchange',
    name: 'Michigan Digital Skills Exchange',
    city: null,
    region: null,
    lanes: [3, 2, 0],
    tags: ['Technical skills', 'Career change'],
    summary:
      'Statewide online learning for people exploring digital careers, building a portfolio or bringing a new idea to life.',
  },
]

const programFixtures = [
  {
    name: 'Career Reset: Your Next Direction',
    summary:
      'Translate the skills you already have into a practical plan for a new career.',
    mode: 'hybrid',
    lane: 0,
    tag: 'Career change',
    duration: '4 weeks',
    cost: 'Free',
    eligibility: 'Adults exploring a career change in Detroit Metro.',
  },
  {
    name: 'Back to Work, With Confidence',
    summary:
      'Refresh your resume, practice interviews and reconnect with the working world.',
    mode: 'in_person',
    lane: 0,
    tag: 'Career re-entry',
    duration: '6 weeks',
    cost: 'Free',
    eligibility: 'Adults returning to work after a career break.',
  },
  {
    name: 'From Idea to First Customer',
    summary:
      'Test a small business idea and learn what your first customers actually need.',
    mode: 'hybrid',
    lane: 1,
    tag: 'Small business',
    duration: '6 weeks',
    cost: 'Free',
    eligibility: 'People with an early business idea in Southeast Michigan.',
  },
  {
    name: 'Startup Foundations',
    summary:
      'Work through the basics of a startup: your customer, your product and a sustainable business model.',
    mode: 'online',
    lane: 2,
    tag: 'Early-stage founders',
    duration: '8 weeks',
    cost: '$75',
    eligibility: 'First-time founders based in Michigan.',
  },
  {
    name: 'Founder Office Hours',
    summary:
      'Bring a specific challenge and work through it with an experienced founder.',
    mode: 'online',
    lane: 2,
    tag: 'Early-stage founders',
    duration: '45-minute sessions',
    cost: 'Free',
    eligibility: 'Michigan-based founders at the idea or early-revenue stage.',
  },
  {
    name: 'Capital Readiness Studio',
    summary:
      'Understand funding options and turn your business numbers into a clear funding story.',
    mode: 'hybrid',
    lane: 2,
    tag: 'Capital readiness',
    duration: '5 weeks',
    cost: '$150',
    eligibility:
      'Founders with an operating business. This program does not provide funding.',
  },
  {
    name: 'Evening Technical Foundations',
    summary:
      'Explore manufacturing technology, basic coding and digital tools in evening sessions designed around a working schedule.',
    mode: 'in_person',
    lane: 3,
    tag: 'Technical skills',
    duration: '10 weeks',
    cost: '$200',
    eligibility:
      'Adults in West Michigan; no previous technical experience required.',
  },
  {
    name: 'Build Your First Technical Portfolio',
    summary:
      'Create small, practical projects that show employers what you can do.',
    mode: 'hybrid',
    lane: 0,
    tag: 'Career change',
    duration: '8 weeks',
    cost: '$100',
    eligibility:
      'Learners with basic computer skills exploring a technical career.',
  },
  {
    name: 'Your Next Leadership Step',
    summary:
      'Develop everyday leadership skills through practical workplace scenarios and peer discussion.',
    mode: 'hybrid',
    lane: 0,
    tag: 'Leadership',
    duration: '6 weeks',
    cost: '$125',
    eligibility: 'Professionals stepping into a first leadership role.',
  },
  {
    name: 'Career Comeback Workshop',
    summary:
      'Make a focused return-to-work plan with support for applications, interviews and new workplace tools.',
    mode: 'in_person',
    lane: 0,
    tag: 'Career re-entry',
    duration: '2 days',
    cost: 'Free',
    eligibility: 'Mid-Michigan residents preparing to return to work.',
  },
  {
    name: 'Small Business, Strong Start',
    summary:
      'Work on pricing, record keeping and a realistic plan for your first year in business.',
    mode: 'hybrid',
    lane: 1,
    tag: 'Small business',
    duration: '6 weeks',
    cost: '$50',
    eligibility: 'New and aspiring small business owners in Northern Michigan.',
  },
  {
    name: 'Growing Beyond Your First Year',
    summary:
      'Find the bottlenecks in your business and build a manageable plan for growth.',
    mode: 'online',
    lane: 1,
    tag: 'Business growth',
    duration: '4 weeks',
    cost: '$75',
    eligibility: 'Michigan businesses with at least one year of operations.',
  },
  {
    name: 'Make It: Product Test Lab',
    summary:
      'Turn a product idea into a simple prototype and learn from early feedback.',
    mode: 'in_person',
    lane: 2,
    tag: 'Product development',
    duration: '8 weeks',
    cost: '$100',
    eligibility: 'Upper Peninsula makers and early-stage founders.',
  },
  {
    name: 'North Star Founder Circle',
    summary:
      'Meet other founders, share a current challenge and leave with one concrete next step.',
    mode: 'hybrid',
    lane: 2,
    tag: 'Early-stage founders',
    duration: 'Monthly sessions',
    cost: 'Free',
    eligibility: 'Upper Peninsula founders and people considering a startup.',
  },
  {
    name: 'Digital Confidence for Work',
    summary:
      'Practice spreadsheets, collaboration tools and everyday digital problem solving.',
    mode: 'in_person',
    lane: 3,
    tag: 'Technical skills',
    duration: '4 weeks',
    cost: 'Free',
    eligibility:
      'Adults in Southeast Michigan looking to strengthen everyday digital skills.',
  },
  {
    name: 'Communication That Moves Work Forward',
    summary:
      'Build confidence in workplace communication, feedback and team problem solving.',
    mode: 'online',
    lane: 3,
    tag: 'Leadership',
    duration: '3 weeks',
    cost: '$30',
    eligibility: 'Michigan adults at any career stage.',
  },
  {
    name: 'Neighborhood Business Launchpad',
    summary:
      'Build a simple plan for a local business and test it with real customer conversations.',
    mode: 'in_person',
    lane: 1,
    tag: 'Small business',
    duration: '8 weeks',
    cost: 'Free',
    eligibility: 'Aspiring neighborhood business owners in Detroit Metro.',
  },
  {
    name: 'Understand Your Funding Options',
    summary:
      'Learn the differences between grants, loans and investment, and prepare questions for a funding conversation.',
    mode: 'online',
    lane: 1,
    tag: 'Capital readiness',
    duration: '2 sessions',
    cost: 'Free',
    eligibility:
      'Michigan small business owners. Participation does not guarantee funding.',
  },
  {
    name: 'Try a Technical Career',
    summary:
      'Explore coding, data and digital design through short projects, at your own pace.',
    mode: 'self_paced',
    lane: 3,
    tag: 'Technical skills',
    duration: '12–20 hours',
    cost: 'Free',
    eligibility:
      'Anyone in Michigan with internet access; no degree or experience required.',
  },
  {
    name: 'Digital Prototype Sprint',
    summary:
      'Build a simple digital prototype and test your idea before investing in a full product.',
    mode: 'online',
    lane: 2,
    tag: 'Product development',
    duration: '2 weeks',
    cost: '$50',
    eligibility:
      'Michigan founders and career explorers with a digital product idea.',
  },
] as const

const slugify = (value: string) =>
  `demo-${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-$/, '')}`

const tagNames = [
  ...new Set([
    ...orgFixtures.flatMap((o) => o.tags),
    ...programFixtures.map((p) => p.tag),
  ]),
]

export async function seedDemoDirectory(db: Database) {
  const now = new Date('2026-11-12T12:00:00Z')
  await db.transaction(async (tx) => {
    await seedCore(tx)
    for (const [i, label] of tagNames.entries()) {
      const row = {
        id: fixtureId(100 + i),
        slug: label.toLowerCase().replaceAll(' ', '-'),
        label,
        groupLabel: 'Prototype vocabulary',
        createdAt: now,
        updatedAt: now,
      }
      await tx
        .insert(tags)
        .values(row)
        .onConflictDoUpdate({ target: tags.id, set: row })
    }
    for (const [i, org] of orgFixtures.entries()) {
      const organizationId = fixtureId(1000 + i)
      const locationId = fixtureId(2000 + i)
      const row = {
        id: organizationId,
        slug: `demo-${org.slug}`,
        displayName: org.name,
        shortDescription: org.summary,
        longDescription: `${org.summary}\n\nThis fictional organization is part of the On-Ramp prototype. Its programs illustrate how Michigan residents might discover career, business and learning support. All details are demonstration content.`,
        status: 'published' as const,
        publishedAt: now,
        lastVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      }
      await tx
        .insert(organizations)
        .values(row)
        .onConflictDoUpdate({ target: organizations.id, set: row })
      const location = {
        id: locationId,
        organizationId,
        city: org.city,
        region: org.region,
        isPrimary: true,
        isStatewide: i === 9,
        isVirtual: i === 9,
        createdAt: now,
        updatedAt: now,
      }
      await tx
        .insert(locations)
        .values(location)
        .onConflictDoUpdate({ target: locations.id, set: location })
      await tx
        .update(organizations)
        .set({ primaryLocationId: locationId })
        .where(eq(organizations.id, organizationId))
      for (const [j, lane] of org.lanes.entries())
        await tx
          .insert(organizationLanes)
          .values({
            organizationId,
            laneId: fixtureId(lane + 1),
            isPrimary: j === 0,
          })
          .onConflictDoNothing()
      for (const tag of org.tags)
        await tx
          .insert(organizationTags)
          .values({
            organizationId,
            tagId: fixtureId(100 + tagNames.indexOf(tag)),
          })
          .onConflictDoNothing()
      const alias = {
        id: fixtureId(3000 + i),
        organizationId,
        alias: org.name
          .split(' ')
          .map((w) => w[0])
          .join(''),
        createdAt: now,
      }
      await tx
        .insert(organizationAliases)
        .values(alias)
        .onConflictDoUpdate({ target: organizationAliases.id, set: alias })
    }
    for (const [i, p] of programFixtures.entries()) {
      const orgIndex = Math.floor(i / 2)
      const offeringId = fixtureId(4000 + i)
      const row = {
        id: offeringId,
        organizationId: fixtureId(1000 + orgIndex),
        slug: slugify(p.name),
        name: p.name,
        summary: p.summary,
        description: `${p.summary}\n\nExpect practical exercises, space to ask questions and a clear next step. This is a fictional demonstration program; the dates, costs and eligibility are examples only.`,
        kind: 'program' as const,
        deliveryMode: p.mode,
        costText: p.cost,
        isFree: p.cost === 'Free',
        costMinCents: p.cost === 'Free' ? 0 : Number(p.cost.slice(1)) * 100,
        durationText: p.duration,
        scheduleText:
          p.mode === 'self_paced'
            ? 'Start anytime'
            : 'Example cohort; dates to be confirmed',
        eligibilitySummary: p.eligibility,
        accessLevel: 'eligibility' as const,
        accessNote:
          'In a live listing, this is where you would find a verified application or contact link. Explore the organization for this demonstration.',
        status: 'published' as const,
        publishedAt: now,
        lastVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      }
      await tx
        .insert(offerings)
        .values(row)
        .onConflictDoUpdate({ target: offerings.id, set: row })
      const allLanes = [...new Set([p.lane, ...orgFixtures[orgIndex].lanes])]
      for (const [j, lane] of allLanes.entries())
        await tx
          .insert(offeringLanes)
          .values({
            offeringId,
            laneId: fixtureId(lane + 1),
            isPrimary: j === 0,
            createdAt: now,
          })
          .onConflictDoNothing()
      await tx
        .insert(offeringTags)
        .values({ offeringId, tagId: fixtureId(100 + tagNames.indexOf(p.tag)) })
        .onConflictDoNothing()
      await tx
        .insert(offeringLocations)
        .values({ offeringId, locationId: fixtureId(2000 + orgIndex) })
        .onConflictDoNothing()
    }
  })
}

// Delete only the registered fixture identities, never a namespace-wide match:
// the four core lanes historically share the fixture UUID prefix.
export async function removeDemoDirectory(db: Database) {
  const orgIds = orgFixtures.map((_, i) => fixtureId(1000 + i))
  const offeringIds = programFixtures.map((_, i) => fixtureId(4000 + i))
  const locationIds = orgFixtures.map((_, i) => fixtureId(2000 + i))
  return db.transaction(async (tx) => {
    await tx
      .delete(offeringLocations)
      .where(inArray(offeringLocations.offeringId, offeringIds))
    await tx
      .delete(offeringTags)
      .where(inArray(offeringTags.offeringId, offeringIds))
    await tx
      .delete(offeringLanes)
      .where(inArray(offeringLanes.offeringId, offeringIds))
    const programs = await tx
      .delete(offerings)
      .where(inArray(offerings.id, offeringIds))
      .returning({ id: offerings.id })
    const aliases = await tx
      .delete(organizationAliases)
      .where(
        inArray(
          organizationAliases.id,
          orgFixtures.map((_, i) => fixtureId(3000 + i)),
        ),
      )
      .returning({ id: organizationAliases.id })
    await tx
      .delete(organizationTags)
      .where(inArray(organizationTags.organizationId, orgIds))
    await tx
      .delete(organizationLanes)
      .where(inArray(organizationLanes.organizationId, orgIds))
    await tx
      .update(organizations)
      .set({ primaryLocationId: null })
      .where(inArray(organizations.id, orgIds))
    const removedLocations = await tx
      .delete(locations)
      .where(inArray(locations.id, locationIds))
      .returning({ id: locations.id })
    const removedOrganizations = await tx
      .delete(organizations)
      .where(inArray(organizations.id, orgIds))
      .returning({ id: organizations.id })
    const removedTags = await tx
      .delete(tags)
      .where(
        and(
          inArray(
            tags.id,
            tagNames.map((_, i) => fixtureId(100 + i)),
          ),
          sql`not exists (select 1 from organization_tags ot where ot.tag_id = ${tags.id})`,
          sql`not exists (select 1 from offering_tags ot where ot.tag_id = ${tags.id})`,
          sql`not exists (select 1 from event_tags et where et.tag_id = ${tags.id})`,
          sql`not exists (select 1 from tags child where child.parent_tag_id = ${tags.id})`,
        ),
      )
      .returning({ id: tags.id })
    // Unexpected references (referrals, real children, etc.) cause a foreign-key
    // failure and roll back everything. They are never cascaded or force-deleted.
    return {
      organizations: removedOrganizations.length,
      programs: programs.length,
      locations: removedLocations.length,
      aliases: aliases.length,
      unusedTags: removedTags.length,
    }
  })
}
