-- Custom migration: rules described in schema-notes.md but absent from DBML DDL.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX organizations_name_trgm_idx ON organizations USING gin (display_name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX offerings_name_trgm_idx ON offerings USING gin (name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX organization_aliases_trgm_idx ON organization_aliases USING gin (alias gin_trgm_ops);
--> statement-breakpoint
CREATE FUNCTION onramp_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'organizations' THEN
    NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.display_name, '')), 'A')
      || setweight(to_tsvector('english', coalesce(NEW.short_description, '')), 'B')
      || setweight(to_tsvector('english', coalesce(NEW.long_description, '')), 'C');
  ELSIF TG_TABLE_NAME = 'offerings' THEN
    NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A')
      || setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B')
      || setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
  ELSE
    NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A')
      || setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER organizations_search BEFORE INSERT OR UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION onramp_search_vector();
--> statement-breakpoint
CREATE TRIGGER offerings_search BEFORE INSERT OR UPDATE ON offerings FOR EACH ROW EXECUTE FUNCTION onramp_search_vector();
--> statement-breakpoint
CREATE TRIGGER events_search BEFORE INSERT OR UPDATE ON events FOR EACH ROW EXECUTE FUNCTION onramp_search_vector();
--> statement-breakpoint
UPDATE organizations SET display_name = display_name;
--> statement-breakpoint
UPDATE offerings SET name = name;
--> statement-breakpoint
UPDATE events SET name = name;
--> statement-breakpoint
CREATE FUNCTION onramp_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
--> statement-breakpoint
DO $$ DECLARE target record; BEGIN
  FOR target IN SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
  LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION onramp_updated_at()', target.table_name);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION onramp_immutable_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.published_at IS NOT NULL OR OLD.status = 'published') AND NEW.slug <> OLD.slug THEN
    RAISE EXCEPTION 'A published canonical slug cannot change';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER organizations_slug BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION onramp_immutable_slug();
--> statement-breakpoint
CREATE TRIGGER offerings_slug BEFORE UPDATE ON offerings FOR EACH ROW EXECUTE FUNCTION onramp_immutable_slug();
--> statement-breakpoint
CREATE TRIGGER events_slug BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION onramp_immutable_slug();
--> statement-breakpoint
CREATE FUNCTION onramp_validate_public_image() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'organizations' THEN
    IF NEW.status = 'published' AND NEW.logo_media_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM media_assets WHERE id = NEW.logo_media_id AND length(trim(coalesce(alt_text, ''))) > 0)
    THEN RAISE EXCEPTION 'Public images require alt text'; END IF;
  ELSE
    IF length(trim(coalesce(NEW.alt_text, ''))) = 0 AND EXISTS
      (SELECT 1 FROM organizations WHERE logo_media_id = NEW.id AND status = 'published')
    THEN RAISE EXCEPTION 'Public images require alt text'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER organizations_image BEFORE INSERT OR UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION onramp_validate_public_image();
--> statement-breakpoint
CREATE TRIGGER media_assets_image BEFORE UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION onramp_validate_public_image();
