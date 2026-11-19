-- SQL dump generated using DBML (dbml.dbdiagram.io)
-- Database: PostgreSQL
-- Generated at: 2026-11-04T19:41:09.146Z

CREATE TYPE "status_enum" AS ENUM (
  'draft',
  'pending_review',
  'published',
  'rejected',
  'stale',
  'archived'
);

CREATE TYPE "offering_kind_enum" AS ENUM (
  'program',
  'course',
  'service',
  'capital',
  'job_board',
  'resource'
);

CREATE TYPE "delivery_mode_enum" AS ENUM (
  'in_person',
  'online',
  'hybrid',
  'self_paced'
);

CREATE TYPE "access_level_enum" AS ENUM (
  'open',
  'free',
  'member',
  'eligibility',
  'application',
  'employer',
  'geographic'
);

CREATE TYPE "event_format_enum" AS ENUM (
  'in_person',
  'virtual',
  'hybrid'
);

CREATE TYPE "contact_kind_enum" AS ENUM (
  'public',
  'referral',
  'internal'
);

CREATE TYPE "claim_status_enum" AS ENUM (
  'unclaimed',
  'pending',
  'claimed'
);

CREATE TYPE "source_kind_enum" AS ENUM (
  'ical',
  'rss',
  'json_api',
  'eventbrite',
  'scrape',
  'manual_upload'
);

CREATE TYPE "source_target_enum" AS ENUM (
  'events',
  'offerings',
  'organization'
);

CREATE TYPE "auto_apply_enum" AS ENUM (
  'never',
  'minor_fields_only',
  'trusted_feed'
);

CREATE TYPE "run_status_enum" AS ENUM (
  'running',
  'success',
  'partial',
  'failed'
);

CREATE TYPE "run_trigger_enum" AS ENUM (
  'cron',
  'manual',
  'backfill'
);

CREATE TYPE "intake_status_enum" AS ENUM (
  'started',
  'abandoned',
  'completed',
  'routed'
);

CREATE TYPE "routing_target_enum" AS ENUM (
  'offering',
  'organization',
  'tag_query'
);

CREATE TYPE "referral_outcome_enum" AS ENUM (
  'pending',
  'confirmed',
  'declined',
  'not_a_fit',
  'no_response',
  'expired'
);

CREATE TYPE "platform_role_enum" AS ENUM (
  'none',
  'mt_staff',
  'admin'
);

CREATE TYPE "membership_role_enum" AS ENUM (
  'owner',
  'editor',
  'viewer'
);

CREATE TABLE "organizations" (
  "id" uuid PRIMARY KEY,
  "slug" text UNIQUE NOT NULL,
  "display_name" text NOT NULL,
  "legal_name" text,
  "organization_type_id" uuid,
  "parent_organization_id" uuid,
  "short_description" text,
  "long_description" text,
  "website_url" text,
  "logo_media_id" uuid,
  "primary_location_id" uuid,
  "is_launch_partner" boolean NOT NULL DEFAULT false,
  "onboarded_at" timestamptz,
  "claim_status" claim_status_enum NOT NULL DEFAULT 'unclaimed',
  "crm_id" text UNIQUE,
  "status" status_enum NOT NULL DEFAULT 'draft',
  "published_at" timestamptz,
  "last_verified_at" timestamptz,
  "source_run_id" uuid,
  "supersedes_id" uuid,
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "search_vector" tsvector,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE "organization_types" (
  "id" uuid PRIMARY KEY,
  "slug" text UNIQUE NOT NULL,
  "label" text NOT NULL,
  "sort_order" integer
);

CREATE TABLE "organization_aliases" (
  "id" uuid PRIMARY KEY,
  "organization_id" uuid NOT NULL,
  "alias" text NOT NULL,
  "created_at" timestamptz NOT NULL
);

CREATE TABLE "organization_contacts" (
  "id" uuid PRIMARY KEY,
  "organization_id" uuid NOT NULL,
  "kind" contact_kind_enum NOT NULL,
  "name" text,
  "title" text,
  "email" text,
  "phone" text,
  "is_public" boolean NOT NULL DEFAULT false,
  "notes" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE "organization_links" (
  "id" uuid PRIMARY KEY,
  "organization_id" uuid NOT NULL,
  "kind" text,
  "url" text NOT NULL,
  "label" text
);

CREATE TABLE "locations" (
  "id" uuid PRIMARY KEY,
  "organization_id" uuid NOT NULL,
  "label" text,
  "street_1" text,
  "street_2" text,
  "city" text,
  "county" text,
  "state" text NOT NULL DEFAULT 'MI',
  "postal_code" text,
  "region" text,
  "latitude" numeric(9,6),
  "longitude" numeric(9,6),
  "is_primary" boolean NOT NULL DEFAULT false,
  "is_virtual" boolean NOT NULL DEFAULT false,
  "is_statewide" boolean NOT NULL DEFAULT false,
  "geocoded_at" timestamptz,
  "geocode_source" text,
  "geocode_accuracy" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE "offerings" (
  "id" uuid PRIMARY KEY,
  "organization_id" uuid NOT NULL,
  "kind" offering_kind_enum NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "summary" text,
  "description" text,
  "delivery_mode" delivery_mode_enum,
  "duration_text" text,
  "schedule_text" text,
  "cost_text" text,
  "cost_min_cents" integer,
  "cost_max_cents" integer,
  "is_free" boolean,
  "access_level" access_level_enum,
  "access_note" text,
  "eligibility_summary" text,
  "prerequisites" text,
  "credential_type" text,
  "url" text,
  "apply_url" text,
  "is_featured" boolean NOT NULL DEFAULT false,
  "featured_group" text,
  "featured_note" text,
  "status" status_enum NOT NULL DEFAULT 'draft',
  "published_at" timestamptz,
  "last_verified_at" timestamptz,
  "source_run_id" uuid,
  "supersedes_id" uuid,
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "search_vector" tsvector,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE "offering_locations" (
  "offering_id" uuid NOT NULL,
  "location_id" uuid NOT NULL
);

CREATE TABLE "events" (
  "id" uuid PRIMARY KEY,
  "organization_id" uuid NOT NULL,
  "offering_id" uuid,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "event_type" text,
  "format" event_format_enum,
  "starts_at" timestamptz,
  "ends_at" timestamptz,
  "is_all_day" boolean NOT NULL DEFAULT false,
  "timezone" text NOT NULL DEFAULT 'America/Detroit',
  "is_recurring" boolean NOT NULL DEFAULT false,
  "recurrence_rule" text,
  "frequency_text" text,
  "date_is_approximate" boolean NOT NULL DEFAULT false,
  "location_id" uuid,
  "venue_text" text,
  "city" text,
  "cost_text" text,
  "is_free" boolean,
  "registration_url" text,
  "url" text,
  "source_id" uuid,
  "source_event_uid" text,
  "source_url" text,
  "status" status_enum NOT NULL DEFAULT 'draft',
  "published_at" timestamptz,
  "last_seen_at" timestamptz,
  "last_verified_at" timestamptz,
  "source_run_id" uuid,
  "supersedes_id" uuid,
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "search_vector" tsvector,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE "lanes" (
  "id" uuid PRIMARY KEY,
  "slug" text UNIQUE NOT NULL,
  "name" text NOT NULL,
  "tagline" text,
  "description" text,
  "sort_order" integer NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true
);

CREATE TABLE "offering_lanes" (
  "offering_id" uuid NOT NULL,
  "lane_id" uuid NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL
);

CREATE TABLE "organization_lanes" (
  "organization_id" uuid NOT NULL,
  "lane_id" uuid NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false
);

CREATE TABLE "tags" (
  "id" uuid PRIMARY KEY,
  "slug" text UNIQUE NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "group_label" text,
  "parent_tag_id" uuid,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE "organization_tags" (
  "organization_id" uuid NOT NULL,
  "tag_id" uuid NOT NULL
);

CREATE TABLE "offering_tags" (
  "offering_id" uuid NOT NULL,
  "tag_id" uuid NOT NULL
);

CREATE TABLE "event_tags" (
  "event_id" uuid NOT NULL,
  "tag_id" uuid NOT NULL
);

CREATE TABLE "sources" (
  "id" uuid PRIMARY KEY,
  "organization_id" uuid,
  "name" text NOT NULL,
  "kind" source_kind_enum NOT NULL,
  "target" source_target_enum NOT NULL,
  "url" text NOT NULL,
  "config" jsonb NOT NULL,
  "schedule_cron" text NOT NULL DEFAULT '0 7 * * *',
  "is_enabled" boolean NOT NULL DEFAULT true,
  "auto_apply_policy" auto_apply_enum NOT NULL DEFAULT 'never',
  "robots_allowed" boolean,
  "robots_checked_at" timestamptz,
  "terms_reviewed_at" timestamptz,
  "last_run_at" timestamptz,
  "last_status" run_status_enum,
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE "source_runs" (
  "id" uuid PRIMARY KEY,
  "source_id" uuid NOT NULL,
  "workflow_instance_id" text,
  "trigger" run_trigger_enum NOT NULL,
  "started_at" timestamptz NOT NULL,
  "finished_at" timestamptz,
  "status" run_status_enum NOT NULL,
  "items_found" integer NOT NULL DEFAULT 0,
  "items_proposed" integer NOT NULL DEFAULT 0,
  "items_unchanged" integer NOT NULL DEFAULT 0,
  "items_disappeared" integer NOT NULL DEFAULT 0,
  "raw_snapshot_key" text,
  "estimated_cost_cents" integer,
  "error_message" text,
  "error_detail" jsonb
);

CREATE TABLE "intake_sessions" (
  "id" uuid PRIMARY KEY,
  "anon_id" uuid NOT NULL,
  "user_id" uuid,
  "lane_id" uuid,
  "status" intake_status_enum NOT NULL DEFAULT 'started',
  "question_set_version" integer NOT NULL,
  "answers" jsonb NOT NULL,
  "started_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  "last_activity_at" timestamptz NOT NULL,
  "referrer_host" text,
  "utm" jsonb,
  "entry_path" text,
  "is_test" boolean NOT NULL DEFAULT false,
  "cohort_tag" text,
  "contact_email" text,
  "contact_name" text,
  "retention_expires_at" timestamptz NOT NULL,
  "anonymized_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE "routing_rules" (
  "id" uuid PRIMARY KEY,
  "name" text NOT NULL,
  "description" text,
  "lane_id" uuid,
  "priority" integer NOT NULL DEFAULT 100,
  "conditions" jsonb NOT NULL,
  "target_type" routing_target_enum NOT NULL,
  "target_id" uuid,
  "target_query" jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE "routing_results" (
  "id" uuid PRIMARY KEY,
  "session_id" uuid NOT NULL,
  "rule_id" uuid,
  "organization_id" uuid,
  "offering_id" uuid,
  "rank" integer NOT NULL,
  "explanation" jsonb NOT NULL,
  "surfaced_at" timestamptz NOT NULL,
  "clicked_at" timestamptz,
  "created_at" timestamptz NOT NULL
);

CREATE TABLE "referrals" (
  "id" uuid PRIMARY KEY,
  "session_id" uuid NOT NULL,
  "routing_result_id" uuid,
  "organization_id" uuid NOT NULL,
  "offering_id" uuid,
  "lane_id" uuid,
  "is_cross_lane" boolean NOT NULL DEFAULT false,
  "confirmation_token" text UNIQUE NOT NULL,
  "notified_at" timestamptz,
  "notification_channel" text,
  "reminder_sent_at" timestamptz,
  "consent_granted_at" timestamptz NOT NULL,
  "consent_policy_version" text NOT NULL,
  "outcome" referral_outcome_enum NOT NULL DEFAULT 'pending',
  "confirmed_at" timestamptz,
  "confirmed_by_user_id" uuid,
  "outcome_note" text,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY,
  "email" text UNIQUE NOT NULL,
  "name" text,
  "platform_role" platform_role_enum NOT NULL DEFAULT 'none',
  "email_verified_at" timestamptz,
  "last_login_at" timestamptz,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE "memberships" (
  "user_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "role" membership_role_enum NOT NULL,
  "created_at" timestamptz NOT NULL
);

CREATE TABLE "claim_requests" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "claimed_email" text,
  "evidence" text,
  "status" text NOT NULL DEFAULT 'pending',
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "review_note" text
);

CREATE TABLE "content_blocks" (
  "id" uuid PRIMARY KEY,
  "key" text UNIQUE NOT NULL,
  "lane_id" uuid,
  "title" text,
  "body_md" text,
  "status" status_enum NOT NULL DEFAULT 'draft',
  "published_at" timestamptz,
  "updated_by" uuid,
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE "media_assets" (
  "id" uuid PRIMARY KEY,
  "kind" text,
  "cf_images_id" text,
  "r2_key" text,
  "alt_text" text,
  "width" integer,
  "height" integer,
  "uploaded_by" uuid,
  "created_at" timestamptz NOT NULL
);

CREATE TABLE "tracking_events" (
  "id" bigint PRIMARY KEY,
  "occurred_at" timestamptz NOT NULL,
  "anon_id" uuid,
  "session_id" uuid,
  "name" text NOT NULL,
  "lane_id" uuid,
  "target_type" text,
  "target_id" uuid,
  "properties" jsonb NOT NULL,
  "is_test" boolean NOT NULL DEFAULT false
);

CREATE TABLE "settings" (
  "key" text PRIMARY KEY,
  "value" jsonb NOT NULL,
  "updated_by" uuid,
  "updated_at" timestamptz NOT NULL
);

COMMENT ON TABLE "organizations" IS 'A partner organization in the directory. The spine of the model.';

COMMENT ON COLUMN "organizations"."slug" IS 'Stable public URL, immutable once published';

COMMENT ON COLUMN "organizations"."parent_organization_id" IS 'Michigan Works! and its member agencies';

COMMENT ON COLUMN "organizations"."short_description" IS 'Directory card, ~200 chars';

COMMENT ON COLUMN "organizations"."long_description" IS 'Profile page, markdown';

COMMENT ON COLUMN "organizations"."crm_id" IS 'This organization record in Middle Third CRM';

COMMENT ON COLUMN "organizations"."last_verified_at" IS 'When a person last confirmed this is accurate';

COMMENT ON COLUMN "organizations"."supersedes_id" IS 'A pending proposal points at the published record it would replace';

COMMENT ON TABLE "organization_types" IS 'Lookup, not an enum — Middle Third can edit these. 11 distinct values in the current data.';

COMMENT ON TABLE "organization_aliases" IS 'People search for "U of M", "UMich", "U-M". Aliases feed search.';

COMMENT ON TABLE "organization_contacts" IS 'Holds personal data. Internal relationship contacts should live in the CRM instead.';

COMMENT ON COLUMN "organization_contacts"."kind" IS 'public | referral | internal';

COMMENT ON TABLE "organization_links" IS 'Secondary URLs. The events page link is often what an update source points at.';

COMMENT ON COLUMN "organization_links"."kind" IS 'website | linkedin | newsletter | events_page';

COMMENT ON TABLE "locations" IS 'Plain lat/lng rather than PostGIS — proximity is a bounding box plus a distance calculation.';

COMMENT ON COLUMN "locations"."label" IS '"Main campus", "SPARK East"';

COMMENT ON COLUMN "locations"."region" IS '"Detroit Metro", "Southeast"';

COMMENT ON TABLE "offerings" IS 'One table for programs, courses, services, capital, job boards and
resources — they are variations on the same thing and share most of
their fields.

No general-purpose attributes column. Categorical facts become tags;
anything numeric you filter or sort on becomes a nullable column.
';

COMMENT ON COLUMN "offerings"."duration_text" IS '"10 weeks", "12 credits"';

COMMENT ON COLUMN "offerings"."schedule_text" IS '"Rolling enrollment", "Fall/Winter"';

COMMENT ON COLUMN "offerings"."cost_text" IS 'Verbatim from source';

COMMENT ON TABLE "offering_locations" IS 'Some offerings run in several cities, so this is a join table rather than a column.';

COMMENT ON TABLE "events" IS 'Separate from offerings because events are higher volume and change far more often. This is where the automated update system spends most of its time.';

COMMENT ON COLUMN "events"."event_type" IS 'Pitch Competition, Job Fair, Workshop';

COMMENT ON COLUMN "events"."starts_at" IS 'Next occurrence for a recurring event';

COMMENT ON COLUMN "events"."recurrence_rule" IS 'RFC 5545 RRULE — stored, not expanded into rows';

COMMENT ON COLUMN "events"."frequency_text" IS '"Annual", "Monthly"';

COMMENT ON COLUMN "events"."source_event_uid" IS 'Feed UID or content fingerprint — the dedup key';

COMMENT ON COLUMN "events"."last_seen_at" IS 'Last confirmed present at source';

COMMENT ON TABLE "lanes" IS 'Exactly four: Corporate Careers, Entrepreneurship, Startup Ecosystem, Learning & Development.';

COMMENT ON TABLE "offering_lanes" IS 'Many-to-many: 82% of organizations in the current data span two or more lanes. is_primary gives one canonical lane for breadcrumbs and reporting.';

COMMENT ON TABLE "tags" IS 'One flat vocabulary. No category table and no nesting under lanes —
both would inherit shape from a proof-of-concept spreadsheet, and the
thing that will consume this structure (routing) does not exist yet.
';

COMMENT ON COLUMN "tags"."group_label" IS 'Soft grouping for the admin UI only — constrains nothing';

COMMENT ON COLUMN "tags"."parent_tag_id" IS 'Optional hierarchy, unused for now';

COMMENT ON TABLE "sources" IS 'One row per place we check for updates. robots_allowed and terms_reviewed_at are the record that we checked before crawling.';

COMMENT ON COLUMN "sources"."kind" IS 'ical | rss | json_api | eventbrite | scrape | manual_upload';

COMMENT ON COLUMN "sources"."target" IS 'events | offerings | organization';

COMMENT ON TABLE "source_runs" IS 'One execution of a source. Proposals land directly in the real tables with status = pending_review.';

COMMENT ON COLUMN "source_runs"."trigger" IS 'cron | manual | backfill';

COMMENT ON COLUMN "source_runs"."raw_snapshot_key" IS 'Saved copy of the page, so we can show a partner where a value came from';

COMMENT ON COLUMN "source_runs"."estimated_cost_cents" IS 'Backs the monthly third-party cost limit';

COMMENT ON TABLE "intake_sessions" IS 'Anonymous by default — someone can be routed without giving any personal information.';

COMMENT ON COLUMN "intake_sessions"."anon_id" IS 'First-party cookie. Not an identity. No IP, no fingerprint.';

COMMENT ON COLUMN "intake_sessions"."answers" IS 'Keyed by question key. Questions live in application code while the flow is still being designed.';

COMMENT ON COLUMN "intake_sessions"."is_test" IS 'Keeps staff walkthroughs out of reported numbers';

COMMENT ON COLUMN "intake_sessions"."cohort_tag" IS 'e.g. momentum-cohort-1';

COMMENT ON COLUMN "intake_sessions"."contact_email" IS 'Only with consent';

COMMENT ON COLUMN "intake_sessions"."contact_name" IS 'Only with consent';

COMMENT ON TABLE "routing_rules" IS 'Kept minimal on purpose. The table most likely to change once a routing prototype exists.';

COMMENT ON COLUMN "routing_rules"."target_query" IS 'A description rather than fixed targets, so new partners get picked up automatically';

COMMENT ON COLUMN "routing_results"."explanation" IS 'Stored, not recomputed — someone should be able to see why they were matched';

COMMENT ON TABLE "referrals" IS 'Backs the contractual 60%+ partner-confirmed follow-through rate, reported monthly. The confirmation mechanism is still an open question.';

COMMENT ON COLUMN "referrals"."is_cross_lane" IS 'Frozen at referral time so a reported number stays stable';

COMMENT ON TABLE "users" IS 'Passwordless. The auth library owns sessions and verification tokens.';

COMMENT ON COLUMN "users"."platform_role" IS 'none | mt_staff | admin';

COMMENT ON COLUMN "memberships"."role" IS 'owner | editor | viewer';

COMMENT ON TABLE "claim_requests" IS 'Email-domain matching against the organization website makes the common case a one-click approval.';

COMMENT ON TABLE "content_blocks" IS 'Site copy Middle Third can edit without a deployment. No version history in v1.';

COMMENT ON COLUMN "media_assets"."alt_text" IS 'Required on anything shown publicly — WCAG 2.1 AA is contractual';

COMMENT ON TABLE "tracking_events" IS 'Append-only funnel instrumentation. A plain table — partitioning can come later if volume ever justifies it.';

COMMENT ON COLUMN "tracking_events"."name" IS 'lane_viewed | intake_started | intake_completed | partner_clicked | referral_confirmed ...';

COMMENT ON TABLE "settings" IS 'Monthly spend cap, ingestion concurrency, referral reminder and expiry windows, feature flags.';

ALTER TABLE "organizations" ADD FOREIGN KEY ("organization_type_id") REFERENCES "organization_types" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organizations" ADD FOREIGN KEY ("parent_organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organizations" ADD FOREIGN KEY ("logo_media_id") REFERENCES "media_assets" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organizations" ADD FOREIGN KEY ("primary_location_id") REFERENCES "locations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organizations" ADD FOREIGN KEY ("source_run_id") REFERENCES "source_runs" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organizations" ADD FOREIGN KEY ("supersedes_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organizations" ADD FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organization_aliases" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organization_contacts" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organization_links" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "locations" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "offerings" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "offerings" ADD FOREIGN KEY ("source_run_id") REFERENCES "source_runs" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "offerings" ADD FOREIGN KEY ("supersedes_id") REFERENCES "offerings" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "offerings" ADD FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "offering_locations" ADD FOREIGN KEY ("offering_id") REFERENCES "offerings" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "offering_locations" ADD FOREIGN KEY ("location_id") REFERENCES "locations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "events" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "events" ADD FOREIGN KEY ("offering_id") REFERENCES "offerings" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "events" ADD FOREIGN KEY ("location_id") REFERENCES "locations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "events" ADD FOREIGN KEY ("source_id") REFERENCES "sources" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "events" ADD FOREIGN KEY ("source_run_id") REFERENCES "source_runs" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "events" ADD FOREIGN KEY ("supersedes_id") REFERENCES "events" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "events" ADD FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "offering_lanes" ADD FOREIGN KEY ("offering_id") REFERENCES "offerings" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "offering_lanes" ADD FOREIGN KEY ("lane_id") REFERENCES "lanes" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organization_lanes" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organization_lanes" ADD FOREIGN KEY ("lane_id") REFERENCES "lanes" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "tags" ADD FOREIGN KEY ("parent_tag_id") REFERENCES "tags" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organization_tags" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "organization_tags" ADD FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "offering_tags" ADD FOREIGN KEY ("offering_id") REFERENCES "offerings" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "offering_tags" ADD FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "event_tags" ADD FOREIGN KEY ("event_id") REFERENCES "events" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "event_tags" ADD FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sources" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "source_runs" ADD FOREIGN KEY ("source_id") REFERENCES "sources" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "intake_sessions" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "intake_sessions" ADD FOREIGN KEY ("lane_id") REFERENCES "lanes" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "routing_rules" ADD FOREIGN KEY ("lane_id") REFERENCES "lanes" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "routing_rules" ADD FOREIGN KEY ("created_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "routing_results" ADD FOREIGN KEY ("session_id") REFERENCES "intake_sessions" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "routing_results" ADD FOREIGN KEY ("rule_id") REFERENCES "routing_rules" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "routing_results" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "routing_results" ADD FOREIGN KEY ("offering_id") REFERENCES "offerings" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "referrals" ADD FOREIGN KEY ("session_id") REFERENCES "intake_sessions" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "referrals" ADD FOREIGN KEY ("routing_result_id") REFERENCES "routing_results" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "referrals" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "referrals" ADD FOREIGN KEY ("offering_id") REFERENCES "offerings" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "referrals" ADD FOREIGN KEY ("lane_id") REFERENCES "lanes" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "referrals" ADD FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "memberships" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "memberships" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "claim_requests" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "claim_requests" ADD FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "claim_requests" ADD FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "content_blocks" ADD FOREIGN KEY ("lane_id") REFERENCES "lanes" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "content_blocks" ADD FOREIGN KEY ("updated_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "media_assets" ADD FOREIGN KEY ("uploaded_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "tracking_events" ADD FOREIGN KEY ("lane_id") REFERENCES "lanes" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "settings" ADD FOREIGN KEY ("updated_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
