-- Separate reused visit IDs only where every older round had already closed.
CREATE TEMP TABLE repaired_visit_ids AS
WITH history AS (
    SELECT id, restaurant_id, table_id, seating_session_id, julianday(created_at) AS opened,
           max(COALESCE(julianday(settled_at), julianday(cancelled_at), 1e20)) OVER (
               PARTITION BY restaurant_id, table_id, seating_session_id
               ORDER BY julianday(created_at), rowid ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ) AS last_close, rowid AS seq
    FROM orders WHERE table_id IS NOT NULL AND seating_session_id IS NOT NULL
), visits AS (
    SELECT *, sum(CASE WHEN opened > last_close THEN 1 ELSE 0 END) OVER (
        PARTITION BY restaurant_id, table_id, seating_session_id ORDER BY opened, seq
    ) AS visit FROM history
)
SELECT id, first_value(id) OVER (
    PARTITION BY restaurant_id, table_id, seating_session_id, visit ORDER BY opened, seq
) AS new_session FROM visits WHERE visit > 0;

CREATE UNIQUE INDEX repaired_visit_order ON repaired_visit_ids(id);
UPDATE orders SET seating_session_id = (SELECT new_session FROM repaired_visit_ids WHERE id = orders.id)
WHERE id IN (SELECT id FROM repaired_visit_ids);
UPDATE tables SET current_seating_session_id = (SELECT new_session FROM repaired_visit_ids WHERE id = tables.active_order_id)
WHERE active_order_id IN (SELECT id FROM repaired_visit_ids);
DROP TABLE repaired_visit_ids;
