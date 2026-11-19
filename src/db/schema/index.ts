// Baseline translated from context/schema.sql. See docs/architecture-decisions.md.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
  bigint,
  customType,
  index,
  uniqueIndex,
  check,
  primaryKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' })

export const statusEnum = pgEnum('status_enum', [
  'draft',
  'pending_review',
  'published',
  'rejected',
  'stale',
  'archived',
])
export const offeringKindEnum = pgEnum('offering_kind_enum', [
  'program',
  'course',
  'service',
  'capital',
  'job_board',
  'resource',
])
export const deliveryModeEnum = pgEnum('delivery_mode_enum', [
  'in_person',
  'online',
  'hybrid',
  'self_paced',
])
export const accessLevelEnum = pgEnum('access_level_enum', [
  'open',
  'free',
  'member',
  'eligibility',
  'application',
  'employer',
  'geographic',
])
export const eventFormatEnum = pgEnum('event_format_enum', [
  'in_person',
  'virtual',
  'hybrid',
])
export const contactKindEnum = pgEnum('contact_kind_enum', [
  'public',
  'referral',
  'internal',
])
export const claimStatusEnum = pgEnum('claim_status_enum', [
  'unclaimed',
  'pending',
  'claimed',
])
export const sourceKindEnum = pgEnum('source_kind_enum', [
  'ical',
  'rss',
  'json_api',
  'eventbrite',
  'scrape',
  'manual_upload',
])
export const sourceTargetEnum = pgEnum('source_target_enum', [
  'events',
  'offerings',
  'organization',
])
export const autoApplyEnum = pgEnum('auto_apply_enum', [
  'never',
  'minor_fields_only',
  'trusted_feed',
])
export const runStatusEnum = pgEnum('run_status_enum', [
  'running',
  'success',
  'partial',
  'failed',
])
export const runTriggerEnum = pgEnum('run_trigger_enum', [
  'cron',
  'manual',
  'backfill',
])
export const intakeStatusEnum = pgEnum('intake_status_enum', [
  'started',
  'abandoned',
  'completed',
  'routed',
])
export const routingTargetEnum = pgEnum('routing_target_enum', [
  'offering',
  'organization',
  'tag_query',
])
export const referralOutcomeEnum = pgEnum('referral_outcome_enum', [
  'pending',
  'confirmed',
  'declined',
  'not_a_fit',
  'no_response',
  'expired',
])
export const platformRoleEnum = pgEnum('platform_role_enum', [
  'none',
  'mt_staff',
  'admin',
])
export const membershipRoleEnum = pgEnum('membership_role_enum', [
  'owner',
  'editor',
  'viewer',
])

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    legalName: text('legal_name'),
    organizationTypeId: uuid('organization_type_id').references(
      (): AnyPgColumn => organizationTypes.id,
    ),
    parentOrganizationId: uuid('parent_organization_id').references(
      (): AnyPgColumn => organizations.id,
    ),
    shortDescription: text('short_description'),
    longDescription: text('long_description'),
    websiteUrl: text('website_url'),
    logoMediaId: uuid('logo_media_id').references(
      (): AnyPgColumn => mediaAssets.id,
    ),
    primaryLocationId: uuid('primary_location_id').references(
      (): AnyPgColumn => locations.id,
    ),
    isLaunchPartner: boolean('is_launch_partner').notNull().default(false),
    onboardedAt: timestamp('onboarded_at', {
      withTimezone: true,
      mode: 'date',
    }),
    claimStatus: claimStatusEnum('claim_status').notNull().default('unclaimed'),
    crmId: text('crm_id').unique(),
    status: statusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastVerifiedAt: timestamp('last_verified_at', {
      withTimezone: true,
      mode: 'date',
    }),
    sourceRunId: uuid('source_run_id').references(
      (): AnyPgColumn => sourceRuns.id,
    ),
    supersedesId: uuid('supersedes_id').references(
      (): AnyPgColumn => organizations.id,
    ),
    reviewedBy: uuid('reviewed_by').references((): AnyPgColumn => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    searchVector: tsvector('search_vector'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('organizations_organization_type_id_idx').on(
      table.organizationTypeId,
    ),
    index('organizations_parent_organization_id_idx').on(
      table.parentOrganizationId,
    ),
    index('organizations_logo_media_id_idx').on(table.logoMediaId),
    index('organizations_primary_location_id_idx').on(table.primaryLocationId),
    index('organizations_source_run_id_idx').on(table.sourceRunId),
    index('organizations_supersedes_id_idx').on(table.supersedesId),
    index('organizations_reviewed_by_idx').on(table.reviewedBy),
    uniqueIndex('organizations_canonical_slug_uidx')
      .on(sql`lower(${table.slug})`)
      .where(sql`${table.supersedesId} is null`),
    index('organizations_search_idx').using('gin', table.searchVector),
  ],
)

export const organizationTypes = pgTable(
  'organization_types',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order'),
  },
  (table) => [],
)

export const organizationAliases = pgTable(
  'organization_aliases',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references((): AnyPgColumn => organizations.id),
    alias: text('alias').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('organization_aliases_organization_id_idx').on(table.organizationId),
  ],
)

export const organizationContacts = pgTable(
  'organization_contacts',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references((): AnyPgColumn => organizations.id),
    kind: contactKindEnum('kind').notNull(),
    name: text('name'),
    title: text('title'),
    email: text('email'),
    phone: text('phone'),
    isPublic: boolean('is_public').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('organization_contacts_organization_id_idx').on(table.organizationId),
  ],
)

export const organizationLinks = pgTable(
  'organization_links',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references((): AnyPgColumn => organizations.id),
    kind: text('kind'),
    url: text('url').notNull(),
    label: text('label'),
  },
  (table) => [
    index('organization_links_organization_id_idx').on(table.organizationId),
  ],
)

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references((): AnyPgColumn => organizations.id),
    label: text('label'),
    street_1: text('street_1'),
    street_2: text('street_2'),
    city: text('city'),
    county: text('county'),
    state: text('state').notNull().default('MI'),
    postalCode: text('postal_code'),
    region: text('region'),
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    isVirtual: boolean('is_virtual').notNull().default(false),
    isStatewide: boolean('is_statewide').notNull().default(false),
    geocodedAt: timestamp('geocoded_at', { withTimezone: true, mode: 'date' }),
    geocodeSource: text('geocode_source'),
    geocodeAccuracy: text('geocode_accuracy'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('locations_organization_id_idx').on(table.organizationId)],
)

export const offerings = pgTable(
  'offerings',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references((): AnyPgColumn => organizations.id),
    kind: offeringKindEnum('kind').notNull(),
    sourceId: uuid('source_id').references((): AnyPgColumn => sources.id),
    sourceRecordId: text('source_record_id'),
    contentHash: text('content_hash'),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    summary: text('summary'),
    description: text('description'),
    deliveryMode: deliveryModeEnum('delivery_mode'),
    durationText: text('duration_text'),
    scheduleText: text('schedule_text'),
    costText: text('cost_text'),
    costMinCents: integer('cost_min_cents'),
    costMaxCents: integer('cost_max_cents'),
    isFree: boolean('is_free'),
    accessLevel: accessLevelEnum('access_level'),
    accessNote: text('access_note'),
    eligibilitySummary: text('eligibility_summary'),
    prerequisites: text('prerequisites'),
    credentialType: text('credential_type'),
    url: text('url'),
    applyUrl: text('apply_url'),
    isFeatured: boolean('is_featured').notNull().default(false),
    featuredGroup: text('featured_group'),
    featuredNote: text('featured_note'),
    status: statusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastVerifiedAt: timestamp('last_verified_at', {
      withTimezone: true,
      mode: 'date',
    }),
    sourceRunId: uuid('source_run_id').references(
      (): AnyPgColumn => sourceRuns.id,
    ),
    supersedesId: uuid('supersedes_id').references(
      (): AnyPgColumn => offerings.id,
    ),
    reviewedBy: uuid('reviewed_by').references((): AnyPgColumn => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    searchVector: tsvector('search_vector'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('offerings_organization_id_idx').on(table.organizationId),
    index('offerings_source_run_id_idx').on(table.sourceRunId),
    index('offerings_source_id_idx').on(table.sourceId),
    uniqueIndex('offerings_source_canonical_uidx')
      .on(table.sourceId, table.sourceRecordId)
      .where(sql`${table.supersedesId} is null`),
    uniqueIndex('offerings_source_proposal_uidx')
      .on(table.sourceId, table.sourceRecordId)
      .where(
        sql`${table.supersedesId} is not null and ${table.status} = 'pending_review'`,
      ),
    index('offerings_supersedes_id_idx').on(table.supersedesId),
    index('offerings_reviewed_by_idx').on(table.reviewedBy),
    uniqueIndex('offerings_canonical_slug_uidx')
      .on(sql`lower(${table.slug})`)
      .where(sql`${table.supersedesId} is null`),
    index('offerings_search_idx').using('gin', table.searchVector),
  ],
)

export const offeringLocations = pgTable(
  'offering_locations',
  {
    offeringId: uuid('offering_id')
      .notNull()
      .references((): AnyPgColumn => offerings.id),
    locationId: uuid('location_id')
      .notNull()
      .references((): AnyPgColumn => locations.id),
  },
  (table) => [
    primaryKey({ columns: [table.offeringId, table.locationId] }),
    index('offering_locations_offering_id_idx').on(table.offeringId),
    index('offering_locations_location_id_idx').on(table.locationId),
  ],
)

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references((): AnyPgColumn => organizations.id),
    offeringId: uuid('offering_id').references((): AnyPgColumn => offerings.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    eventType: text('event_type'),
    format: eventFormatEnum('format'),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
    isAllDay: boolean('is_all_day').notNull().default(false),
    timezone: text('timezone').notNull().default('America/Detroit'),
    isRecurring: boolean('is_recurring').notNull().default(false),
    recurrenceRule: text('recurrence_rule'),
    frequencyText: text('frequency_text'),
    dateIsApproximate: boolean('date_is_approximate').notNull().default(false),
    locationId: uuid('location_id').references((): AnyPgColumn => locations.id),
    venueText: text('venue_text'),
    city: text('city'),
    costText: text('cost_text'),
    isFree: boolean('is_free'),
    registrationUrl: text('registration_url'),
    url: text('url'),
    sourceId: uuid('source_id').references((): AnyPgColumn => sources.id),
    sourceEventUid: text('source_event_uid'),
    contentHash: text('content_hash'),
    sourceUrl: text('source_url'),
    status: statusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }),
    lastVerifiedAt: timestamp('last_verified_at', {
      withTimezone: true,
      mode: 'date',
    }),
    sourceRunId: uuid('source_run_id').references(
      (): AnyPgColumn => sourceRuns.id,
    ),
    supersedesId: uuid('supersedes_id').references(
      (): AnyPgColumn => events.id,
    ),
    reviewedBy: uuid('reviewed_by').references((): AnyPgColumn => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    searchVector: tsvector('search_vector'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('events_organization_id_idx').on(table.organizationId),
    index('events_offering_id_idx').on(table.offeringId),
    index('events_location_id_idx').on(table.locationId),
    index('events_source_id_idx').on(table.sourceId),
    index('events_source_run_id_idx').on(table.sourceRunId),
    index('events_supersedes_id_idx').on(table.supersedesId),
    index('events_reviewed_by_idx').on(table.reviewedBy),
    uniqueIndex('events_canonical_slug_uidx')
      .on(sql`lower(${table.slug})`)
      .where(sql`${table.supersedesId} is null`),
    index('events_search_idx').using('gin', table.searchVector),
    index('events_published_starts_idx')
      .on(table.startsAt)
      .where(sql`${table.status} = 'published'`),
    uniqueIndex('events_source_live_uidx')
      .on(table.sourceId, table.sourceEventUid)
      .where(sql`${table.status} = 'published'`),
    uniqueIndex('events_source_canonical_uidx')
      .on(table.sourceId, table.sourceEventUid)
      .where(sql`${table.supersedesId} is null`),
    uniqueIndex('events_source_proposal_uidx')
      .on(table.sourceId, table.sourceEventUid)
      .where(
        sql`${table.supersedesId} is not null and ${table.status} = 'pending_review'`,
      ),
  ],
)

export const lanes = pgTable(
  'lanes',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    tagline: text('tagline'),
    description: text('description'),
    sortOrder: integer('sort_order').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [],
)

export const offeringLanes = pgTable(
  'offering_lanes',
  {
    offeringId: uuid('offering_id')
      .notNull()
      .references((): AnyPgColumn => offerings.id),
    laneId: uuid('lane_id')
      .notNull()
      .references((): AnyPgColumn => lanes.id),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.offeringId, table.laneId] }),
    index('offering_lanes_offering_id_idx').on(table.offeringId),
    index('offering_lanes_lane_id_idx').on(table.laneId),
    uniqueIndex('offering_lanes_primary_uidx')
      .on(table.offeringId)
      .where(sql`${table.isPrimary} = true`),
  ],
)

export const organizationLanes = pgTable(
  'organization_lanes',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references((): AnyPgColumn => organizations.id),
    laneId: uuid('lane_id')
      .notNull()
      .references((): AnyPgColumn => lanes.id),
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.laneId] }),
    index('organization_lanes_organization_id_idx').on(table.organizationId),
    index('organization_lanes_lane_id_idx').on(table.laneId),
    uniqueIndex('organization_lanes_primary_uidx')
      .on(table.organizationId)
      .where(sql`${table.isPrimary} = true`),
  ],
)

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    label: text('label').notNull(),
    description: text('description'),
    groupLabel: text('group_label'),
    parentTagId: uuid('parent_tag_id').references((): AnyPgColumn => tags.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('tags_parent_tag_id_idx').on(table.parentTagId)],
)

export const organizationTags = pgTable(
  'organization_tags',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references((): AnyPgColumn => organizations.id),
    tagId: uuid('tag_id')
      .notNull()
      .references((): AnyPgColumn => tags.id),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.tagId] }),
    index('organization_tags_organization_id_idx').on(table.organizationId),
    index('organization_tags_tag_id_idx').on(table.tagId),
  ],
)

export const offeringTags = pgTable(
  'offering_tags',
  {
    offeringId: uuid('offering_id')
      .notNull()
      .references((): AnyPgColumn => offerings.id),
    tagId: uuid('tag_id')
      .notNull()
      .references((): AnyPgColumn => tags.id),
  },
  (table) => [
    primaryKey({ columns: [table.offeringId, table.tagId] }),
    index('offering_tags_offering_id_idx').on(table.offeringId),
    index('offering_tags_tag_id_idx').on(table.tagId),
  ],
)

export const eventTags = pgTable(
  'event_tags',
  {
    eventId: uuid('event_id')
      .notNull()
      .references((): AnyPgColumn => events.id),
    tagId: uuid('tag_id')
      .notNull()
      .references((): AnyPgColumn => tags.id),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.tagId] }),
    index('event_tags_event_id_idx').on(table.eventId),
    index('event_tags_tag_id_idx').on(table.tagId),
  ],
)

// Pending classification is separate from listing publication and canonical tags.
export const taggingRuns = pgTable(
  'tagging_runs',
  {
    id: uuid('id').primaryKey(),
    mode: text('mode').notNull(),
    status: text('status').notNull(),
    taxonomyVersion: text('taxonomy_version').notNull(),
    promptVersion: text('prompt_version').notNull(),
    model: text('model'),
    selection: jsonb('selection').notNull(),
    configSnapshot: jsonb('config_snapshot').notNull(),
    itemsCompleted: integer('items_completed').notNull().default(0),
    itemsFailed: integer('items_failed').notNull().default(0),
    usage: jsonb('usage'),
    createdBy: uuid('created_by')
      .notNull()
      .references((): AnyPgColumn => users.id),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (t) => [
    index('tagging_runs_created_by_idx').on(t.createdBy),
    check(
      'tagging_runs_mode_check',
      sql`${t.mode} in ('deterministic', 'hybrid')`,
    ),
    check(
      'tagging_runs_status_check',
      sql`${t.status} in ('running', 'success', 'partial', 'failed')`,
    ),
  ],
)

export const taggingProposals = pgTable(
  'tagging_proposals',
  {
    id: uuid('id').primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references((): AnyPgColumn => taggingRuns.id),
    organizationId: uuid('organization_id').references(
      (): AnyPgColumn => organizations.id,
    ),
    offeringId: uuid('offering_id').references((): AnyPgColumn => offerings.id),
    eventId: uuid('event_id').references((): AnyPgColumn => events.id),
    contentHash: text('content_hash').notNull(),
    tagSetHash: text('tag_set_hash').notNull(),
    recordUpdatedAt: timestamp('record_updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    snapshot: jsonb('snapshot').notNull(),
    status: text('status').notNull().default('pending_review'),
    issues: jsonb('issues').notNull(),
    errorCode: text('error_code'),
    usage: jsonb('usage'),
    reviewNote: text('review_note'),
    reviewedBy: uuid('reviewed_by').references((): AnyPgColumn => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (t) => [
    check(
      'tagging_proposals_one_entity_check',
      sql`num_nonnulls(${t.organizationId}, ${t.offeringId}, ${t.eventId}) = 1`,
    ),
    check(
      'tagging_proposals_status_check',
      sql`${t.status} in ('pending_review', 'approved', 'rejected')`,
    ),
    index('tagging_proposals_run_idx').on(t.runId),
    index('tagging_proposals_organization_idx').on(t.organizationId),
    index('tagging_proposals_offering_idx').on(t.offeringId),
    index('tagging_proposals_event_idx').on(t.eventId),
    index('tagging_proposals_reviewer_idx').on(t.reviewedBy),
  ],
)

export const taggingSuggestions = pgTable(
  'tagging_suggestions',
  {
    proposalId: uuid('proposal_id')
      .notNull()
      .references((): AnyPgColumn => taggingProposals.id),
    tagId: uuid('tag_id')
      .notNull()
      .references((): AnyPgColumn => tags.id),
    basis: text('basis').notNull(),
    evidenceField: text('evidence_field').notNull(),
    evidenceQuote: text('evidence_quote').notNull(),
    isSelected: boolean('is_selected').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.proposalId, t.tagId] }),
    index('tagging_suggestions_tag_idx').on(t.tagId),
    check(
      'tagging_suggestions_basis_check',
      sql`${t.basis} in ('rule', 'model', 'reviewer')`,
    ),
  ],
)

export const sources = pgTable(
  'sources',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').references(
      (): AnyPgColumn => organizations.id,
    ),
    name: text('name').notNull(),
    kind: sourceKindEnum('kind').notNull(),
    target: sourceTargetEnum('target').notNull(),
    url: text('url').notNull(),
    config: jsonb('config').notNull(),
    scheduleCron: text('schedule_cron').notNull().default('0 7 * * *'),
    isEnabled: boolean('is_enabled').notNull().default(true),
    autoApplyPolicy: autoApplyEnum('auto_apply_policy')
      .notNull()
      .default('never'),
    robotsAllowed: boolean('robots_allowed'),
    robotsCheckedAt: timestamp('robots_checked_at', {
      withTimezone: true,
      mode: 'date',
    }),
    termsReviewedAt: timestamp('terms_reviewed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    termsReviewNote: text('terms_review_note'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true, mode: 'date' }),
    lastStatus: runStatusEnum('last_status'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('sources_organization_id_idx').on(table.organizationId)],
)

export const sourceRuns = pgTable(
  'source_runs',
  {
    id: uuid('id').primaryKey(),
    sourceId: uuid('source_id')
      .notNull()
      .references((): AnyPgColumn => sources.id),
    workflowInstanceId: text('workflow_instance_id'),
    trigger: runTriggerEnum('trigger').notNull(),
    startedAt: timestamp('started_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
    status: runStatusEnum('status').notNull(),
    itemsFound: integer('items_found').notNull().default(0),
    itemsProposed: integer('items_proposed').notNull().default(0),
    itemsUnchanged: integer('items_unchanged').notNull().default(0),
    itemsDisappeared: integer('items_disappeared').notNull().default(0),
    rawSnapshotKey: text('raw_snapshot_key'),
    configSnapshot: jsonb('config_snapshot'),
    extractionMode: text('extraction_mode'),
    diagnostics: jsonb('diagnostics'),
    estimatedCostCents: integer('estimated_cost_cents'),
    errorMessage: text('error_message'),
    errorDetail: jsonb('error_detail'),
  },
  (table) => [
    index('source_runs_source_id_idx').on(table.sourceId),
    uniqueIndex('source_runs_one_running_uidx')
      .on(table.sourceId)
      .where(sql`${table.status} = 'running'`),
  ],
)

export const intakeSessions = pgTable(
  'intake_sessions',
  {
    id: uuid('id').primaryKey(),
    anonId: uuid('anon_id').notNull(),
    userId: uuid('user_id').references((): AnyPgColumn => users.id),
    laneId: uuid('lane_id').references((): AnyPgColumn => lanes.id),
    status: intakeStatusEnum('status').notNull().default('started'),
    questionSetVersion: integer('question_set_version').notNull(),
    answers: jsonb('answers').notNull(),
    startedAt: timestamp('started_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastActivityAt: timestamp('last_activity_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    referrerHost: text('referrer_host'),
    utm: jsonb('utm'),
    entryPath: text('entry_path'),
    isTest: boolean('is_test').notNull().default(false),
    cohortTag: text('cohort_tag'),
    contactEmail: text('contact_email'),
    contactName: text('contact_name'),
    retentionExpiresAt: timestamp('retention_expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    anonymizedAt: timestamp('anonymized_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('intake_sessions_user_id_idx').on(table.userId),
    index('intake_sessions_lane_id_idx').on(table.laneId),
  ],
)

export const routingRules = pgTable(
  'routing_rules',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    laneId: uuid('lane_id').references((): AnyPgColumn => lanes.id),
    priority: integer('priority').notNull().default(100),
    conditions: jsonb('conditions').notNull(),
    targetType: routingTargetEnum('target_type').notNull(),
    targetId: uuid('target_id'),
    targetQuery: jsonb('target_query'),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('routing_rules_lane_id_idx').on(table.laneId),
    index('routing_rules_created_by_idx').on(table.createdBy),
  ],
)

export const routingResults = pgTable(
  'routing_results',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references((): AnyPgColumn => intakeSessions.id),
    ruleId: uuid('rule_id').references((): AnyPgColumn => routingRules.id),
    organizationId: uuid('organization_id').references(
      (): AnyPgColumn => organizations.id,
    ),
    offeringId: uuid('offering_id').references((): AnyPgColumn => offerings.id),
    rank: integer('rank').notNull(),
    explanation: jsonb('explanation').notNull(),
    surfacedAt: timestamp('surfaced_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    clickedAt: timestamp('clicked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('routing_results_session_id_idx').on(table.sessionId),
    index('routing_results_rule_id_idx').on(table.ruleId),
    index('routing_results_organization_id_idx').on(table.organizationId),
    index('routing_results_offering_id_idx').on(table.offeringId),
  ],
)

export const referrals = pgTable(
  'referrals',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references((): AnyPgColumn => intakeSessions.id),
    routingResultId: uuid('routing_result_id').references(
      (): AnyPgColumn => routingResults.id,
    ),
    organizationId: uuid('organization_id')
      .notNull()
      .references((): AnyPgColumn => organizations.id),
    offeringId: uuid('offering_id').references((): AnyPgColumn => offerings.id),
    laneId: uuid('lane_id').references((): AnyPgColumn => lanes.id),
    isCrossLane: boolean('is_cross_lane').notNull().default(false),
    confirmationToken: text('confirmation_token').notNull().unique(),
    notifiedAt: timestamp('notified_at', { withTimezone: true, mode: 'date' }),
    notificationChannel: text('notification_channel'),
    reminderSentAt: timestamp('reminder_sent_at', {
      withTimezone: true,
      mode: 'date',
    }),
    consentGrantedAt: timestamp('consent_granted_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    consentPolicyVersion: text('consent_policy_version').notNull(),
    outcome: referralOutcomeEnum('outcome').notNull().default('pending'),
    confirmedAt: timestamp('confirmed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    confirmedByUserId: uuid('confirmed_by_user_id').references(
      (): AnyPgColumn => users.id,
    ),
    outcomeNote: text('outcome_note'),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('referrals_session_id_idx').on(table.sessionId),
    index('referrals_routing_result_id_idx').on(table.routingResultId),
    index('referrals_organization_id_idx').on(table.organizationId),
    index('referrals_offering_id_idx').on(table.offeringId),
    index('referrals_lane_id_idx').on(table.laneId),
    index('referrals_confirmed_by_user_id_idx').on(table.confirmedByUserId),
  ],
)

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    platformRole: platformRoleEnum('platform_role').notNull().default('none'),
    emailVerifiedAt: timestamp('email_verified_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastLoginAt: timestamp('last_login_at', {
      withTimezone: true,
      mode: 'date',
    }),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('users_email_lower_uidx').on(sql`lower(${table.email})`),
  ],
)

export const memberships = pgTable(
  'memberships',
  {
    userId: uuid('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references((): AnyPgColumn => organizations.id),
    role: membershipRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.organizationId] }),
    index('memberships_user_id_idx').on(table.userId),
    index('memberships_organization_id_idx').on(table.organizationId),
  ],
)

export const claimRequests = pgTable(
  'claim_requests',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references((): AnyPgColumn => organizations.id),
    claimedEmail: text('claimed_email'),
    evidence: text('evidence'),
    status: text('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references((): AnyPgColumn => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewNote: text('review_note'),
  },
  (table) => [
    index('claim_requests_user_id_idx').on(table.userId),
    index('claim_requests_organization_id_idx').on(table.organizationId),
    index('claim_requests_reviewed_by_idx').on(table.reviewedBy),
  ],
)

export const contentBlocks = pgTable(
  'content_blocks',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull().unique(),
    laneId: uuid('lane_id').references((): AnyPgColumn => lanes.id),
    title: text('title'),
    bodyMd: text('body_md'),
    status: statusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
      mode: 'date',
    }),
    updatedBy: uuid('updated_by').references((): AnyPgColumn => users.id),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('content_blocks_lane_id_idx').on(table.laneId),
    index('content_blocks_updated_by_idx').on(table.updatedBy),
  ],
)

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind'),
    cfImagesId: text('cf_images_id'),
    r2Key: text('r2_key'),
    altText: text('alt_text'),
    width: integer('width'),
    height: integer('height'),
    uploadedBy: uuid('uploaded_by').references((): AnyPgColumn => users.id),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('media_assets_uploaded_by_idx').on(table.uploadedBy)],
)

export const trackingEvents = pgTable(
  'tracking_events',
  {
    id: bigint('id', { mode: 'number' })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    occurredAt: timestamp('occurred_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    anonId: uuid('anon_id'),
    sessionId: uuid('session_id'),
    name: text('name').notNull(),
    laneId: uuid('lane_id').references((): AnyPgColumn => lanes.id),
    targetType: text('target_type'),
    targetId: uuid('target_id'),
    properties: jsonb('properties').notNull(),
    isTest: boolean('is_test').notNull().default(false),
  },
  (table) => [
    index('tracking_events_lane_id_idx').on(table.laneId),
    index('tracking_events_occurredAt_idx').on(table.occurredAt),
    index('tracking_events_sessionId_idx').on(table.sessionId),
    index('tracking_events_name_idx').on(table.name),
  ],
)

export const settings = pgTable(
  'settings',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    updatedBy: uuid('updated_by').references((): AnyPgColumn => users.id),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('settings_updated_by_idx').on(table.updatedBy)],
)
