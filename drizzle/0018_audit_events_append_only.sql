-- AUD-04: the audit trail is append-only. A row trigger (not a privilege) so it
-- holds for every role, including the migration owner and ad hoc psql sessions.
-- TRUNCATE stays allowed so the demo seed can reset a database.
CREATE FUNCTION "audit_events_reject_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_reject_change"();
