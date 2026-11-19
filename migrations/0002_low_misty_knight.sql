ALTER TABLE "events" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "source_record_id" text;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "source_runs" ADD COLUMN "config_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "source_runs" ADD COLUMN "extraction_mode" text;--> statement-breakpoint
ALTER TABLE "source_runs" ADD COLUMN "diagnostics" jsonb;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "terms_review_note" text;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_source_canonical_uidx" ON "events" USING btree ("source_id","source_event_uid") WHERE "events"."supersedes_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "events_source_proposal_uidx" ON "events" USING btree ("source_id","source_event_uid") WHERE "events"."supersedes_id" is not null and "events"."status" = 'pending_review';--> statement-breakpoint
CREATE INDEX "offerings_source_id_idx" ON "offerings" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offerings_source_canonical_uidx" ON "offerings" USING btree ("source_id","source_record_id") WHERE "offerings"."supersedes_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "offerings_source_proposal_uidx" ON "offerings" USING btree ("source_id","source_record_id") WHERE "offerings"."supersedes_id" is not null and "offerings"."status" = 'pending_review';--> statement-breakpoint
CREATE UNIQUE INDEX "source_runs_one_running_uidx" ON "source_runs" USING btree ("source_id") WHERE "source_runs"."status" = 'running';