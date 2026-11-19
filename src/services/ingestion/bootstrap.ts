import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import {
  organizations,
  organizationLanes,
  locations,
  lanes,
  sources,
  users,
} from '../../db/schema'
import { sourceConfig, type SourceConfig } from './contracts'

const stableId = (n: number) =>
  `019a7e01-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
export const localReviewerId = stableId(1)
const profiles = [
  {
    key: '20fathoms',
    name: '20Fathoms',
    site: 'https://20fathoms.org/',
    city: 'Traverse City',
    region: 'Northern Michigan',
    lanes: ['startup-ecosystem', 'entrepreneurship'],
    summary:
      'Northern Michigan startup support, coaching, coworking and founder events.',
    row: 123,
  },
  {
    key: 'west-michigan-works',
    name: 'West Michigan Works!',
    site: 'https://www.westmiworks.org/',
    city: 'Grand Rapids',
    region: 'West Michigan',
    lanes: ['corporate-careers', 'learning-development'],
    summary:
      'Workforce development and career support across West Michigan, including workshops and employer connections.',
    row: 98,
  },
  {
    key: 'grand-rapids-community-college',
    name: 'Grand Rapids Community College',
    site: 'https://www.grcc.edu/',
    city: 'Grand Rapids',
    region: 'West Michigan',
    lanes: ['learning-development', 'corporate-careers'],
    summary:
      'Job training and workforce education in health care, manufacturing, information technology and construction.',
    row: 23,
  },
  {
    key: 'ann-arbor-spark',
    name: 'Ann Arbor SPARK',
    site: 'https://annarborusa.org/',
    city: 'Ann Arbor',
    region: 'Southeast',
    lanes: ['entrepreneurship', 'startup-ecosystem', 'learning-development'],
    summary:
      'Business growth and startup support in the Ann Arbor region, including acceleration, coaching and professional development.',
    row: 3,
  },
  {
    key: 'washtenaw-community-college',
    name: 'Washtenaw Community College',
    site: 'https://www.wccnet.edu/',
    city: 'Ann Arbor',
    region: 'Southeast',
    lanes: ['entrepreneurship', 'learning-development'],
    summary:
      'Entrepreneurship education, business exploration and coaching for students and community members.',
    row: 95,
  },
  {
    key: 'innovate-marquette',
    name: 'Innovate Marquette SmartZone',
    site: 'https://innovatemarquette.org/',
    city: 'Marquette',
    region: 'Upper Peninsula',
    lanes: ['startup-ecosystem', 'entrepreneurship', 'learning-development'],
    summary:
      'Upper Peninsula venture development, product prototyping and entrepreneurial support, including the Invent@NMU partnership.',
    row: 27,
  },
  {
    key: 'michigan-sbdc',
    name: 'Michigan Small Business Development Center',
    site: 'https://michigansbdc.org/',
    city: 'Grand Rapids',
    region: 'Statewide',
    lanes: ['entrepreneurship', 'startup-ecosystem'],
    summary:
      'Statewide small business consulting, startup support, growth services and technology commercialization assistance.',
    row: 40,
  },
  {
    // Entities row 96 is Wayne State; do not create a second TechTown source for it.
    key: 'techtowncenter',
    name: 'TechTown Detroit',
    site: 'https://techtowndetroit.org/',
    city: 'Detroit',
    region: 'Detroit Metro',
    lanes: ['entrepreneurship', 'startup-ecosystem', 'learning-development'],
    summary:
      'Detroit business support, retail entrepreneurship training and technology startup programs.',
    row: 115,
  },
  {
    key: 'capital-area-michigan-works',
    name: 'Capital Area Michigan Works!',
    site: 'https://www.camw.org/',
    city: 'Lansing',
    region: 'South Central',
    lanes: ['corporate-careers', 'learning-development'],
    summary:
      'Career workshops, job search support and employer connections serving the Lansing region.',
    row: 8,
  },
]
const htmlRules = {
  scope: 'body',
  fields: {
    name: { selector: 'h1', required: true },
    description: { selector: 'main p', required: true },
  },
}
export const initialSources: {
  name: string
  url: string
  target: 'events' | 'offerings'
  kind: 'json_api' | 'scrape'
  isEnabled?: boolean
  setupNote?: string
  config: SourceConfig
}[] = [
  {
    name: '20Fathoms — events',
    url: 'https://20fathoms.org/wp-json/tribe/events/v1/events',
    target: 'events',
    kind: 'json_api',
    config: sourceConfig.parse({
      version: 1,
      key: '20fathoms-events',
      allowedHosts: ['20fathoms.org'],
      limit: 5,
      lanes: profiles[0].lanes,
      discovery: { type: 'tribe-json' },
    }),
  },
  {
    name: 'West Michigan Works! — workshops',
    url: 'https://www.westmiworks.org/wp-json/tribe/events/v1/events',
    target: 'events',
    kind: 'json_api',
    config: sourceConfig.parse({
      version: 1,
      key: 'west-mi-works-events',
      allowedHosts: ['www.westmiworks.org'],
      limit: 5,
      lanes: profiles[1].lanes,
      discovery: { type: 'tribe-json' },
    }),
  },
  {
    name: 'GRCC — job training programs',
    url: 'https://www.grcc.edu/schools-departments/school-workforce-training/job-training-programs',
    target: 'offerings',
    kind: 'scrape',
    config: sourceConfig.parse({
      version: 1,
      key: 'grcc-programs',
      allowedHosts: ['www.grcc.edu'],
      limit: 3,
      lanes: profiles[2].lanes,
      discovery: {
        type: 'links',
        selector:
          'main a[href$="/automotive-technician"], main a[href$="/computer-support-technician"], main a[href$="/welding-fabrication-technician"]',
        includePath:
          '/schools-departments/school-workforce-training/job-training-programs/',
      },
      dom: {
        scope: 'body',
        fields: {
          name: { selector: 'h1', required: true },
          summary: {
            selector: 'main .field--name-body > p:first-of-type',
            required: true,
          },
          description: {
            selector: 'main .field--name-body > p:nth-of-type(-n+4)',
            required: true,
          },
        },
      },
    }),
  },
  {
    name: 'Ann Arbor SPARK — programs',
    url: 'https://annarborusa.org/events/training-and-workshops/sparklead/',
    target: 'offerings',
    kind: 'scrape',
    config: sourceConfig.parse({
      version: 1,
      key: 'spark-programs',
      allowedHosts: ['annarborusa.org'],
      limit: 3,
      lanes: profiles[3].lanes,
      discovery: {
        type: 'pages',
        urls: [
          'https://annarborusa.org/events/training-and-workshops/sparklead/',
          'https://annarborusa.org/spark-services/startup-services/entrepreneur-boot-camp/',
          'https://annarborusa.org/spark-services/startup-services/coaching-mentorship/',
        ],
      },
      dom: {
        ...htmlRules,
        fields: {
          ...htmlRules.fields,
          description: {
            selector: 'main .site-main__content p.wp-block-paragraph',
            required: true,
          },
        },
      },
    }),
  },
  {
    name: 'WCC — entrepreneurship programs',
    url: 'https://www.wccnet.edu/succeed/entrepreneurship-center/five-month-business-start-up-bootcamp.php',
    target: 'offerings',
    kind: 'scrape',
    config: sourceConfig.parse({
      version: 1,
      key: 'wcc-programs',
      allowedHosts: ['www.wccnet.edu'],
      limit: 2,
      lanes: profiles[4].lanes,
      discovery: {
        type: 'pages',
        urls: [
          'https://www.wccnet.edu/succeed/entrepreneurship-center/five-month-business-start-up-bootcamp.php',
          'https://www.wccnet.edu/succeed/entrepreneurship-center/exploration.php',
        ],
      },
      dom: {
        scope: 'body',
        fields: {
          name: { selector: 'h1#header-page-title', required: true },
          description: {
            selector: 'main#main-content > p, main#main-content > ul',
            required: true,
          },
          costText: {
            selector: 'main > p:contains("free for current WCC students")',
          },
          durationText: { selector: 'main > p:contains("10+")' },
          scheduleText: { selector: 'main > p:contains("hybrid format")' },
          eligibilitySummary: {
            selector:
              'main > p:contains("free for current WCC students"), main > p:contains("18 years or older")',
          },
        },
      },
    }),
  },
  {
    name: 'Innovate Marquette — venture and prototyping services',
    url: 'https://innovatemarquette.org/innovation-journey/',
    target: 'offerings',
    kind: 'scrape',
    config: sourceConfig.parse({
      version: 1,
      key: 'innovate-marquette-programs',
      allowedHosts: ['innovatemarquette.org'],
      limit: 3,
      lanes: profiles[5].lanes,
      discovery: {
        type: 'pages',
        urls: [
          'https://innovatemarquette.org/innovation-journey/',
          'https://innovatemarquette.org/protolab/',
          'https://innovatemarquette.org/programs-services/inventnmu/',
        ],
      },
      dom: {
        scope: 'body',
        fields: {
          name: { selector: 'h1.elementor-heading-title', required: true },
          description: {
            selector:
              '[data-elementor-type="wp-page"] .elementor-widget-text-editor p',
            required: true,
          },
        },
      },
    }),
  },
  {
    name: 'Michigan SBDC — startup, growth and tech services',
    url: 'https://michigansbdc.org/get-started/start-a-business/',
    target: 'offerings',
    kind: 'scrape',
    config: sourceConfig.parse({
      version: 1,
      key: 'michigan-sbdc-programs',
      allowedHosts: ['michigansbdc.org'],
      limit: 3,
      lanes: profiles[6].lanes,
      discovery: {
        type: 'pages',
        urls: [
          'https://michigansbdc.org/get-started/start-a-business/',
          'https://michigansbdc.org/get-started/grow-my-business/',
          'https://michigansbdc.org/our-services/tech-consultants/',
        ],
      },
      dom: {
        scope: 'body',
        fields: {
          name: { selector: 'main .wbp_wrapper > h1', required: true },
          description: {
            selector: 'main .wbp_wrapper:has(> h1) > p, main .wbp_wrapper > ul',
            required: true,
          },
          costText: {
            selector: 'main .wbp_wrapper:has(> h1) > h2:contains("No-Cost")',
          },
          eligibilitySummary: {
            selector:
              'main .wbp_wrapper:has(> h1) > p:contains("meeting at least 2")',
          },
        },
      },
    }),
  },
  {
    name: 'TechTown Detroit — business programs (permission required)',
    url: 'https://techtowndetroit.org/what-we-do/small-business-programs/rbc/',
    target: 'offerings',
    kind: 'scrape',
    isEnabled: false,
    setupNote:
      'Blocked: https://techtowndetroit.org/terms-of-service/ section 8 prohibits automated scripts and unauthorized deep links. Obtain publisher permission before enabling or importing. Policy inspected 2026-11-13; this is not a completed terms review.',
    config: sourceConfig.parse({
      version: 1,
      key: 'techtown-programs',
      allowedHosts: ['techtowndetroit.org'],
      limit: 3,
      lanes: profiles[7].lanes,
      discovery: {
        type: 'pages',
        urls: [
          'https://techtowndetroit.org/what-we-do/small-business-programs/rbc/',
          'https://techtowndetroit.org/what-we-do/tech-programs/start-studio/',
          'https://techtowndetroit.org/what-we-do/small-business-programs/coaching-up/',
        ],
      },
      dom: {
        scope: 'body',
        fields: {
          name: {
            selector: 'body > section:nth-of-type(2) h1:first',
            required: true,
          },
          description: {
            selector:
              '.bde-section-4975-196 .bde-text, .bde-section-4636-137 .bde-text, .bde-section-4977-120 .bde-text',
            required: true,
          },
        },
      },
    }),
  },
  {
    name: 'Capital Area Michigan Works! — career events',
    url: 'https://www.camw.org/about-us/events',
    target: 'events',
    kind: 'scrape',
    config: sourceConfig.parse({
      version: 1,
      key: 'capital-area-mi-works-events',
      allowedHosts: ['www.camw.org'],
      limit: 5,
      lanes: profiles[8].lanes,
      discovery: {
        type: 'links',
        selector: 'main a[href^="/events/"]',
        includePath: '/events/',
      },
      dom: {
        scope: 'main#main',
        fields: {
          name: { selector: '.event-item > .info > h1', required: true },
          description: {
            selector: '.event-item > .info > p:not(:has(span, strong))',
            required: true,
          },
          startsAt: {
            selector:
              '.event-item .date-display-start, .event-item .date-display-single',
            attribute: 'content',
            required: true,
          },
          endsAt: {
            selector: '.event-item .date-display-end',
            attribute: 'content',
          },
          venueText: { selector: '.event-item > .info > p > strong' },
        },
      },
    }),
  },
]

export async function bootstrapIngestion(db: Database) {
  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({
        id: localReviewerId,
        email: 'local-ingestion-reviewer@onramp.invalid',
        name: 'Local ingestion reviewer',
        platformRole: 'mt_staff',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
    for (const [i, profile] of profiles.entries()) {
      const organizationId = stableId(100 + i)
      const now = new Date()
      // Bootstrap only creates records. Re-running never resets review decisions or selectors.
      await tx
        .insert(organizations)
        .values({
          id: organizationId,
          slug: profile.key,
          displayName: profile.name,
          websiteUrl: profile.site,
          shortDescription: profile.summary,
          longDescription: profile.summary,
          status: 'pending_review',
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
      const locationId = stableId(200 + i)
      await tx
        .insert(locations)
        .values({
          id: locationId,
          organizationId,
          city: profile.city,
          region: profile.region,
          isPrimary: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
      const laneRows = await tx.select().from(lanes)
      for (const [j, slug] of profile.lanes.entries()) {
        const lane = laneRows.find((l) => l.slug === slug)
        if (!lane)
          throw new Error('Seed the four lanes before running ingest setup')
        await tx
          .insert(organizationLanes)
          .values({ organizationId, laneId: lane.id, isPrimary: j === 0 })
          .onConflictDoNothing()
      }
      const source = initialSources[i]
      await tx
        .insert(sources)
        .values({
          id: stableId(300 + i),
          organizationId,
          name: source.name,
          kind: source.kind,
          target: source.target,
          url: source.url,
          config: source.config,
          isEnabled: source.isEnabled ?? true,
          termsReviewNote: source.setupNote,
          autoApplyPolicy: 'never',
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
    }
  })
  return {
    reviewerId: localReviewerId,
    sources: initialSources.map((source, i) => ({
      id: stableId(300 + i),
      key: source.config.key,
    })),
  }
}
