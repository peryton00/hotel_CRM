ALTER TABLE public.points_rewards ADD COLUMN delivered_at timestamptz;
CREATE INDEX pending_point_rewards ON public.points_rewards(restaurant_id,request_id) WHERE delivered_at IS NULL;
CREATE INDEX feedback_device_cursor ON public.customer_feedback(restaurant_id,created_at,id);
