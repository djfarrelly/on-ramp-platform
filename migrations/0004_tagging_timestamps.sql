CREATE TRIGGER set_updated_at BEFORE UPDATE ON tagging_runs FOR EACH ROW EXECUTE FUNCTION onramp_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tagging_proposals FOR EACH ROW EXECUTE FUNCTION onramp_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tagging_suggestions FOR EACH ROW EXECUTE FUNCTION onramp_updated_at();
