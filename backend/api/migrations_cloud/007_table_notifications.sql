-- Empty invalidation only. The customer fetches authoritative state through Render.
CREATE FUNCTION public.broadcast_dining_table_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
        PERFORM realtime.send('{}'::jsonb, 'changed', 'table:' || NEW.id::text, false);
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_dining_table_change() FROM PUBLIC;
CREATE TRIGGER notify_dining_table_change AFTER UPDATE ON public.tables
FOR EACH ROW WHEN ((OLD.status, OLD.ordering_enabled, OLD.current_seating_session_id)
    IS DISTINCT FROM (NEW.status, NEW.ordering_enabled, NEW.current_seating_session_id))
EXECUTE FUNCTION public.broadcast_dining_table_change();
