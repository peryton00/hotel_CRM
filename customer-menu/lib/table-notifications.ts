import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const client = url && key ? createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}) : undefined;

export function watchTable(id: string | undefined, refresh: () => void) {
  if (!client || !id) return () => {};
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      last = Date.now();
      refresh();
    }, Math.max(0, last + 1000 - Date.now()));
  };
  const channel = client.channel("table:" + id)
    .on("broadcast", { event: "changed" }, invalidate)
    .subscribe(status => { if (status === "SUBSCRIBED") invalidate(); });
  return () => {
    clearTimeout(timer);
    void client.removeChannel(channel);
  };
}
