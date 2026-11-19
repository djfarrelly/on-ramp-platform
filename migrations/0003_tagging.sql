CREATE TABLE "tagging_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"organization_id" uuid,
	"offering_id" uuid,
	"event_id" uuid,
	"content_hash" text NOT NULL,
	"tag_set_hash" text NOT NULL,
	"record_updated_at" timestamp with time zone NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"issues" jsonb NOT NULL,
	"error_code" text,
	"usage" jsonb,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tagging_proposals_one_entity_check" CHECK (num_nonnulls("tagging_proposals"."organization_id", "tagging_proposals"."offering_id", "tagging_proposals"."event_id") = 1),
	CONSTRAINT "tagging_proposals_status_check" CHECK ("tagging_proposals"."status" in ('pending_review', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "tagging_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"taxonomy_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text,
	"selection" jsonb NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"items_completed" integer DEFAULT 0 NOT NULL,
	"items_failed" integer DEFAULT 0 NOT NULL,
	"usage" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tagging_runs_mode_check" CHECK ("tagging_runs"."mode" in ('deterministic', 'hybrid')),
	CONSTRAINT "tagging_runs_status_check" CHECK ("tagging_runs"."status" in ('running', 'success', 'partial', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "tagging_suggestions" (
	"proposal_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"basis" text NOT NULL,
	"evidence_field" text NOT NULL,
	"evidence_quote" text NOT NULL,
	"is_selected" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tagging_suggestions_proposal_id_tag_id_pk" PRIMARY KEY("proposal_id","tag_id"),
	CONSTRAINT "tagging_suggestions_basis_check" CHECK ("tagging_suggestions"."basis" in ('rule', 'model', 'reviewer'))
);
--> statement-breakpoint
ALTER TABLE "tagging_proposals" ADD CONSTRAINT "tagging_proposals_run_id_tagging_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."tagging_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging_proposals" ADD CONSTRAINT "tagging_proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging_proposals" ADD CONSTRAINT "tagging_proposals_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging_proposals" ADD CONSTRAINT "tagging_proposals_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging_proposals" ADD CONSTRAINT "tagging_proposals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging_runs" ADD CONSTRAINT "tagging_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging_suggestions" ADD CONSTRAINT "tagging_suggestions_proposal_id_tagging_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."tagging_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagging_suggestions" ADD CONSTRAINT "tagging_suggestions_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tagging_proposals_run_idx" ON "tagging_proposals" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "tagging_proposals_organization_idx" ON "tagging_proposals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tagging_proposals_offering_idx" ON "tagging_proposals" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "tagging_proposals_event_idx" ON "tagging_proposals" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "tagging_proposals_reviewer_idx" ON "tagging_proposals" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX "tagging_runs_created_by_idx" ON "tagging_runs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "tagging_suggestions_tag_idx" ON "tagging_suggestions" USING btree ("tag_id");