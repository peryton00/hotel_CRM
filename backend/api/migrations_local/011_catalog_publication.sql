CREATE TABLE catalog_publications (
    restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
    revision uuid NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO catalog_publications(restaurant_id) SELECT id FROM restaurants;
CREATE FUNCTION enqueue_catalog_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid;
BEGIN
    IF TG_TABLE_NAME = 'restaurants' THEN rid := NEW.id;
    ELSE rid := COALESCE(NEW.restaurant_id, OLD.restaurant_id);
    END IF;
    INSERT INTO catalog_publications(restaurant_id) SELECT id FROM restaurants WHERE id=rid
    ON CONFLICT(restaurant_id) DO UPDATE SET revision=gen_random_uuid();
    RETURN NULL;
END;
$$;
CREATE TRIGGER publish_restaurant AFTER INSERT OR UPDATE ON restaurants FOR EACH ROW EXECUTE FUNCTION enqueue_catalog_publication();
CREATE TRIGGER publish_categories AFTER INSERT OR UPDATE OR DELETE ON menu_categories FOR EACH ROW EXECUTE FUNCTION enqueue_catalog_publication();
CREATE TRIGGER publish_items AFTER INSERT OR UPDATE OR DELETE ON menu_items FOR EACH ROW EXECUTE FUNCTION enqueue_catalog_publication();
