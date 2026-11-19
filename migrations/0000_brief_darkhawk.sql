CREATE TYPE "public"."access_level_enum" AS ENUM('open', 'free', 'member', 'eligibility', 'application', 'employer', 'geographic');--> statement-breakpoint
CREATE TYPE "public"."auto_apply_enum" AS ENUM('never', 'minor_fields_only', 'trusted_feed');--> statement-breakpoint
CREATE TYPE "public"."claim_status_enum" AS ENUM('unclaimed', 'pending', 'claimed');--> statement-breakpoint
CREATE TYPE "public"."contact_kind_enum" AS ENUM('public', 'referral', 'internal');--> statement-breakpoint
CREATE TYPE "public"."delivery_mode_enum" AS ENUM('in_person', 'online', 'hybrid', 'self_paced');--> statement-breakpoint
CREATE TYPE "public"."event_format_enum" AS ENUM('in_person', 'virtual', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."intake_status_enum" AS ENUM('started', 'abandoned', 'completed', 'routed');--> statement-breakpoint
CREATE TYPE "public"."membership_role_enum" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."offering_kind_enum" AS ENUM('program', 'course', 'service', 'capital', 'job_board', 'resource');--> statement-breakpoint
CREATE TYPE "public"."platform_role_enum" AS ENUM('none', 'mt_staff', 'admin');--> statement-breakpoint
CREATE TYPE "public"."referral_outcome_enum" AS ENUM('pending', 'confirmed', 'declined', 'not_a_fit', 'no_response', 'expired');--> statement-breakpoint
CREATE TYPE "public"."routing_target_enum" AS ENUM('offering', 'organization', 'tag_query');--> statement-breakpoint
CREATE TYPE "public"."run_status_enum" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_trigger_enum" AS ENUM('cron', 'manual', 'backfill');--> statement-breakpoint
CREATE TYPE "public"."source_kind_enum" AS ENUM('ical', 'rss', 'json_api', 'eventbrite', 'scrape', 'manual_upload');--> statement-breakpoint
CREATE TYPE "public"."source_target_enum" AS ENUM('events', 'offerings', 'organization');--> statement-breakpoint
CREATE TYPE "public"."status_enum" AS ENUM('draft', 'pending_review', 'published', 'rejected', 'stale', 'archived');--> statement-breakpoint
CREATE TABLE "claim_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"claimed_email" text,
	"evidence" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE "content_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"lane_id" uuid,
	"title" text,
	"body_md" text,
	"status" "status_enum" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "content_blocks_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "event_tags" (
	"event_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "event_tags_event_id_tag_id_pk" PRIMARY KEY("event_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"offering_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"event_type" text,
	"format" "event_format_enum",
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_all_day" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'America/Detroit' NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurrence_rule" text,
	"frequency_text" text,
	"date_is_approximate" boolean DEFAULT false NOT NULL,
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
	"status" "status_enum" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"source_run_id" uuid,
	"supersedes_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"anon_id" uuid NOT NULL,
	"user_id" uuid,
	"lane_id" uuid,
	"status" "intake_status_enum" DEFAULT 'started' NOT NULL,
	"question_set_version" integer NOT NULL,
	"answers" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone NOT NULL,
	"referrer_host" text,
	"utm" jsonb,
	"entry_path" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"cohort_tag" text,
	"contact_email" text,
	"contact_name" text,
	"retention_expires_at" timestamp with time zone NOT NULL,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lanes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"description" text,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "lanes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text,
	"street_1" text,
	"street_2" text,
	"city" text,
	"county" text,
	"state" text DEFAULT 'MI' NOT NULL,
	"postal_code" text,
	"region" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_virtual" boolean DEFAULT false NOT NULL,
	"is_statewide" boolean DEFAULT false NOT NULL,
	"geocoded_at" timestamp with time zone,
	"geocode_source" text,
	"geocode_accuracy" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text,
	"cf_images_id" text,
	"r2_key" text,
	"alt_text" text,
	"width" integer,
	"height" integer,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "membership_role_enum" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "memberships_user_id_organization_id_pk" PRIMARY KEY("user_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "offering_lanes" (
	"offering_id" uuid NOT NULL,
	"lane_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "offering_lanes_offering_id_lane_id_pk" PRIMARY KEY("offering_id","lane_id")
);
--> statement-breakpoint
CREATE TABLE "offering_locations" (
	"offering_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "offering_locations_offering_id_location_id_pk" PRIMARY KEY("offering_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "offering_tags" (
	"offering_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "offering_tags_offering_id_tag_id_pk" PRIMARY KEY("offering_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "offerings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "offering_kind_enum" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"description" text,
	"delivery_mode" "delivery_mode_enum",
	"duration_text" text,
	"schedule_text" text,
	"cost_text" text,
	"cost_min_cents" integer,
	"cost_max_cents" integer,
	"is_free" boolean,
	"access_level" "access_level_enum",
	"access_note" text,
	"eligibility_summary" text,
	"prerequisites" text,
	"credential_type" text,
	"url" text,
	"apply_url" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"featured_group" text,
	"featured_note" text,
	"status" "status_enum" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"source_run_id" uuid,
	"supersedes_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_aliases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "contact_kind_enum" NOT NULL,
	"name" text,
	"title" text,
	"email" text,
	"phone" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_lanes" (
	"organization_id" uuid NOT NULL,
	"lane_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "organization_lanes_organization_id_lane_id_pk" PRIMARY KEY("organization_id","lane_id")
);
--> statement-breakpoint
CREATE TABLE "organization_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text,
	"url" text NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE TABLE "organization_tags" (
	"organization_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "organization_tags_organization_id_tag_id_pk" PRIMARY KEY("organization_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "organization_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer,
	CONSTRAINT "organization_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"legal_name" text,
	"organization_type_id" uuid,
	"parent_organization_id" uuid,
	"short_description" text,
	"long_description" text,
	"website_url" text,
	"logo_media_id" uuid,
	"primary_location_id" uuid,
	"is_launch_partner" boolean DEFAULT false NOT NULL,
	"onboarded_at" timestamp with time zone,
	"claim_status" "claim_status_enum" DEFAULT 'unclaimed' NOT NULL,
	"crm_id" text,
	"status" "status_enum" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"source_run_id" uuid,
	"supersedes_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "organizations_crm_id_unique" UNIQUE("crm_id")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"routing_result_id" uuid,
	"organization_id" uuid NOT NULL,
	"offering_id" uuid,
	"lane_id" uuid,
	"is_cross_lane" boolean DEFAULT false NOT NULL,
	"confirmation_token" text NOT NULL,
	"notified_at" timestamp with time zone,
	"notification_channel" text,
	"reminder_sent_at" timestamp with time zone,
	"consent_granted_at" timestamp with time zone NOT NULL,
	"consent_policy_version" text NOT NULL,
	"outcome" "referral_outcome_enum" DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_user_id" uuid,
	"outcome_note" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "referrals_confirmation_token_unique" UNIQUE("confirmation_token")
);
--> statement-breakpoint
CREATE TABLE "routing_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"rule_id" uuid,
	"organization_id" uuid,
	"offering_id" uuid,
	"rank" integer NOT NULL,
	"explanation" jsonb NOT NULL,
	"surfaced_at" timestamp with time zone NOT NULL,
	"clicked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"lane_id" uuid,
	"priority" integer DEFAULT 100 NOT NULL,
	"conditions" jsonb NOT NULL,
	"target_type" "routing_target_enum" NOT NULL,
	"target_id" uuid,
	"target_query" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"workflow_instance_id" text,
	"trigger" "run_trigger_enum" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "run_status_enum" NOT NULL,
	"items_found" integer DEFAULT 0 NOT NULL,
	"items_proposed" integer DEFAULT 0 NOT NULL,
	"items_unchanged" integer DEFAULT 0 NOT NULL,
	"items_disappeared" integer DEFAULT 0 NOT NULL,
	"raw_snapshot_key" text,
	"estimated_cost_cents" integer,
	"error_message" text,
	"error_detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"kind" "source_kind_enum" NOT NULL,
	"target" "source_target_enum" NOT NULL,
	"url" text NOT NULL,
	"config" jsonb NOT NULL,
	"schedule_cron" text DEFAULT '0 7 * * *' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"auto_apply_policy" "auto_apply_enum" DEFAULT 'never' NOT NULL,
	"robots_allowed" boolean,
	"robots_checked_at" timestamp with time zone,
	"terms_reviewed_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_status" "run_status_enum",
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"group_label" text,
	"parent_tag_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tracking_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tracking_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone NOT NULL,
	"anon_id" uuid,
	"session_id" uuid,
	"name" text NOT NULL,
	"lane_id" uuid,
	"target_type" text,
	"target_id" uuid,
	"properties" jsonb NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"platform_role" "platform_role_enum" DEFAULT 'none' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tags" ADD CONSTRAINT "event_tags_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tags" ADD CONSTRAINT "event_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_source_run_id_source_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."source_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_supersedes_id_events_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_sessions" ADD CONSTRAINT "intake_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_sessions" ADD CONSTRAINT "intake_sessions_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_lanes" ADD CONSTRAINT "offering_lanes_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_lanes" ADD CONSTRAINT "offering_lanes_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_locations" ADD CONSTRAINT "offering_locations_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_locations" ADD CONSTRAINT "offering_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_tags" ADD CONSTRAINT "offering_tags_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_tags" ADD CONSTRAINT "offering_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_source_run_id_source_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."source_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_supersedes_id_offerings_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_aliases" ADD CONSTRAINT "organization_aliases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_lanes" ADD CONSTRAINT "organization_lanes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_lanes" ADD CONSTRAINT "organization_lanes_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_links" ADD CONSTRAINT "organization_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tags" ADD CONSTRAINT "organization_tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tags" ADD CONSTRAINT "organization_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_organization_type_id_organization_types_id_fk" FOREIGN KEY ("organization_type_id") REFERENCES "public"."organization_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_organization_id_organizations_id_fk" FOREIGN KEY ("parent_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_logo_media_id_media_assets_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_primary_location_id_locations_id_fk" FOREIGN KEY ("primary_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_source_run_id_source_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."source_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_supersedes_id_organizations_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_session_id_intake_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."intake_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_routing_result_id_routing_results_id_fk" FOREIGN KEY ("routing_result_id") REFERENCES "public"."routing_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_results" ADD CONSTRAINT "routing_results_session_id_intake_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."intake_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_results" ADD CONSTRAINT "routing_results_rule_id_routing_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."routing_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_results" ADD CONSTRAINT "routing_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_results" ADD CONSTRAINT "routing_results_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_parent_tag_id_tags_id_fk" FOREIGN KEY ("parent_tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_requests_user_id_idx" ON "claim_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "claim_requests_organization_id_idx" ON "claim_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "claim_requests_reviewed_by_idx" ON "claim_requests" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX "content_blocks_lane_id_idx" ON "content_blocks" USING btree ("lane_id");--> statement-breakpoint
CREATE INDEX "content_blocks_updated_by_idx" ON "content_blocks" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "event_tags_event_id_idx" ON "event_tags" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_tags_tag_id_idx" ON "event_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "events_organization_id_idx" ON "events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "events_offering_id_idx" ON "events" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "events_location_id_idx" ON "events" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "events_source_id_idx" ON "events" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "events_source_run_id_idx" ON "events" USING btree ("source_run_id");--> statement-breakpoint
CREATE INDEX "events_supersedes_id_idx" ON "events" USING btree ("supersedes_id");--> statement-breakpoint
CREATE INDEX "events_reviewed_by_idx" ON "events" USING btree ("reviewed_by");--> statement-breakpoint
CREATE UNIQUE INDEX "events_canonical_slug_uidx" ON "events" USING btree (lower("slug")) WHERE "events"."supersedes_id" is null;--> statement-breakpoint
CREATE INDEX "events_search_idx" ON "events" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "events_published_starts_idx" ON "events" USING btree ("starts_at") WHERE "events"."status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "events_source_live_uidx" ON "events" USING btree ("source_id","source_event_uid") WHERE "events"."status" = 'published';--> statement-breakpoint
CREATE INDEX "intake_sessions_user_id_idx" ON "intake_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "intake_sessions_lane_id_idx" ON "intake_sessions" USING btree ("lane_id");--> statement-breakpoint
CREATE INDEX "locations_organization_id_idx" ON "locations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "media_assets_uploaded_by_idx" ON "media_assets" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_organization_id_idx" ON "memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "offering_lanes_offering_id_idx" ON "offering_lanes" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "offering_lanes_lane_id_idx" ON "offering_lanes" USING btree ("lane_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offering_lanes_primary_uidx" ON "offering_lanes" USING btree ("offering_id") WHERE "offering_lanes"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "offering_locations_offering_id_idx" ON "offering_locations" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "offering_locations_location_id_idx" ON "offering_locations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "offering_tags_offering_id_idx" ON "offering_tags" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "offering_tags_tag_id_idx" ON "offering_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "offerings_organization_id_idx" ON "offerings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "offerings_source_run_id_idx" ON "offerings" USING btree ("source_run_id");--> statement-breakpoint
CREATE INDEX "offerings_supersedes_id_idx" ON "offerings" USING btree ("supersedes_id");--> statement-breakpoint
CREATE INDEX "offerings_reviewed_by_idx" ON "offerings" USING btree ("reviewed_by");--> statement-breakpoint
CREATE UNIQUE INDEX "offerings_canonical_slug_uidx" ON "offerings" USING btree (lower("slug")) WHERE "offerings"."supersedes_id" is null;--> statement-breakpoint
CREATE INDEX "offerings_search_idx" ON "offerings" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "organization_aliases_organization_id_idx" ON "organization_aliases" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_contacts_organization_id_idx" ON "organization_contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_lanes_organization_id_idx" ON "organization_lanes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_lanes_lane_id_idx" ON "organization_lanes" USING btree ("lane_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_lanes_primary_uidx" ON "organization_lanes" USING btree ("organization_id") WHERE "organization_lanes"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "organization_links_organization_id_idx" ON "organization_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_tags_organization_id_idx" ON "organization_tags" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_tags_tag_id_idx" ON "organization_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "organizations_organization_type_id_idx" ON "organizations" USING btree ("organization_type_id");--> statement-breakpoint
CREATE INDEX "organizations_parent_organization_id_idx" ON "organizations" USING btree ("parent_organization_id");--> statement-breakpoint
CREATE INDEX "organizations_logo_media_id_idx" ON "organizations" USING btree ("logo_media_id");--> statement-breakpoint
CREATE INDEX "organizations_primary_location_id_idx" ON "organizations" USING btree ("primary_location_id");--> statement-breakpoint
CREATE INDEX "organizations_source_run_id_idx" ON "organizations" USING btree ("source_run_id");--> statement-breakpoint
CREATE INDEX "organizations_supersedes_id_idx" ON "organizations" USING btree ("supersedes_id");--> statement-breakpoint
CREATE INDEX "organizations_reviewed_by_idx" ON "organizations" USING btree ("reviewed_by");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_canonical_slug_uidx" ON "organizations" USING btree (lower("slug")) WHERE "organizations"."supersedes_id" is null;--> statement-breakpoint
CREATE INDEX "organizations_search_idx" ON "organizations" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "referrals_session_id_idx" ON "referrals" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "referrals_routing_result_id_idx" ON "referrals" USING btree ("routing_result_id");--> statement-breakpoint
CREATE INDEX "referrals_organization_id_idx" ON "referrals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "referrals_offering_id_idx" ON "referrals" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "referrals_lane_id_idx" ON "referrals" USING btree ("lane_id");--> statement-breakpoint
CREATE INDEX "referrals_confirmed_by_user_id_idx" ON "referrals" USING btree ("confirmed_by_user_id");--> statement-breakpoint
CREATE INDEX "routing_results_session_id_idx" ON "routing_results" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "routing_results_rule_id_idx" ON "routing_results" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "routing_results_organization_id_idx" ON "routing_results" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "routing_results_offering_id_idx" ON "routing_results" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "routing_rules_lane_id_idx" ON "routing_rules" USING btree ("lane_id");--> statement-breakpoint
CREATE INDEX "routing_rules_created_by_idx" ON "routing_rules" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "settings_updated_by_idx" ON "settings" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "source_runs_source_id_idx" ON "source_runs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "sources_organization_id_idx" ON "sources" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tags_parent_tag_id_idx" ON "tags" USING btree ("parent_tag_id");--> statement-breakpoint
CREATE INDEX "tracking_events_lane_id_idx" ON "tracking_events" USING btree ("lane_id");--> statement-breakpoint
CREATE INDEX "tracking_events_occurredAt_idx" ON "tracking_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "tracking_events_sessionId_idx" ON "tracking_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "tracking_events_name_idx" ON "tracking_events" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uidx" ON "users" USING btree (lower("email"));