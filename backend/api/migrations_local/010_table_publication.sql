-- Coalesce offline table changes. The worker removes only the revision it published.
CREATE TABLE table_publications (
    table_id uuid PRIMARY KEY,
    revision uuid NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO table_publications(table_id) SELECT id FROM tables;
CREATE FUNCTION enqueue_table_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO table_publications(table_id) VALUES(COALESCE(NEW.id, OLD.id))
    ON CONFLICT(table_id) DO UPDATE SET revision = gen_random_uuid();
    RETURN NULL;
END;
$$;
CREATE TRIGGER publish_table_changes AFTER INSERT OR UPDATE OR DELETE ON tables
FOR EACH ROW EXECUTE FUNCTION enqueue_table_publication();
