-- event_log is append-only: reject UPDATE and DELETE at the database, not just by convention.
CREATE FUNCTION event_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'event_log is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER event_log_no_update_delete BEFORE UPDATE OR DELETE ON event_log
  FOR EACH ROW EXECUTE FUNCTION event_log_append_only();
