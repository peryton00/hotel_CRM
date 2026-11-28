CREATE TABLE public.reward_policy(restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id),config jsonb NOT NULL);
ALTER TABLE public.reward_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reward_policy FROM PUBLIC,anon,authenticated;
CREATE TABLE public.points_rewards(request_id uuid PRIMARY KEY,restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),customer_id uuid NOT NULL REFERENCES public.customers(id),coupon_id uuid NOT NULL REFERENCES public.coupons(id));
ALTER TABLE public.points_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.points_rewards FROM PUBLIC,anon,authenticated;
