const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const RID = process.env.NEXT_PUBLIC_RESTAURANT_ID || '00000000-0000-0000-0000-000000000001';

export async function getTable(token: string) {
  const res = await fetch(`${BASE}/public/tables/${token}?rid=${RID}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw {
      status: res.status,
      message: err.error || err.message || 'Table unavailable',
    };
  }
  return res.json(); // { data: { id, table_number, section, status, ordering_enabled } }
}

export async function getMenu() {
  try {
    const res = await fetch(`${BASE}/public/menu?rid=${RID}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return { data: { categories: [], items: [] } };
    }
    return res.json();
  } catch {
    return { data: { categories: [], items: [] } };
  }
}

export async function getRestaurantStatus() {
  try {
    const res = await fetch(`${BASE}/public/restaurant-status?rid=${RID}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return { data: { is_pos_online: false, restaurant_status: 'OFFLINE', message: 'Offline' } };
    }
    return res.json();
  } catch {
    return { data: { is_pos_online: false, restaurant_status: 'OFFLINE', message: 'Unreachable' } };
  }
}

export async function placeOrder(body: {
  table_id?: string;
  table_number?: string;
  customer_name: string;
  customer_phone: string;
  seating_session_id?: string;
  items: {
    menu_item_id: string;
    item_name: string;
    quantity: number;
    unit_price_paise: number;
    notes?: string;
  }[];
  notes?: string;
  coupon_code?: string;
  discount_paise?: number;
}) {
  try {
    const res = await fetch(`${BASE}/public/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, restaurant_id: RID }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg =
        typeof err?.error === 'object' && err.error?.message
          ? err.error.message
          : typeof err?.error === 'string'
          ? err.error
          : typeof err?.message === 'string'
          ? err.message
          : 'Failed to submit order';
      const isPosOffline = res.status === 409 || String(msg).includes('RESTAURANT_POS_OFFLINE');
      throw {
        status: res.status,
        message: String(msg),
        isPosOffline,
      };
    }
    return res.json();
  } catch (e: any) {
    if (e.isPosOffline) throw e;
    const isNetworkError = !e.status || e.name === 'TypeError' || String(e.message).includes('fetch');
    const msgStr = typeof e?.message === 'string' ? e.message : 'Failed to place order. Restaurant system may be offline.';
    throw {
      status: e.status || 503,
      message: msgStr,
      isPosOffline: isNetworkError || e.status === 409,
    };
  }
}

export async function getCustomerOrders(phone?: string, tableId?: string) {
  try {
    let url = `${BASE}/public/orders?rid=${RID}`;
    if (phone && phone.trim().length > 0) {
      url += `&phone=${encodeURIComponent(phone.trim())}`;
    }
    if (tableId && tableId.trim().length > 0) {
      url += `&table_id=${encodeURIComponent(tableId.trim())}`;
    }
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return { data: [] };
    }
    return res.json();
  } catch {
    return { data: [] };
  }
}

export async function getCoupons() {
  try {
    const res = await fetch(`${BASE}/public/coupons?rid=${RID}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { data: [] };
    return res.json();
  } catch {
    return { data: [] };
  }
}

export async function getCustomerLoyalty(phone: string) {
  try {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10) return null;
    const res = await fetch(`${BASE}/public/customer/loyalty?rid=${RID}&phone=${encodeURIComponent(clean)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || null;
  } catch {
    return null;
  }
}

export const lookupCustomer = getCustomerLoyalty;

export async function updateCustomerProfile(phone: string, name: string) {
  try {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10 || !name.trim()) return null;
    const res = await fetch(`${BASE}/public/customer/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: RID,
        phone: clean,
        name: name.trim(),
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || null;
  } catch {
    return null;
  }
}

export async function getLoyaltyMilestoneConfig() {
  try {
    const res = await fetch(`${BASE}/public/loyalty-config?rid=${RID}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || null;
  } catch {
    return null;
  }
}

export async function createReservation(body: {
  customer_name: string;
  customer_phone: string;
  guest_count: number;
  reservation_time: string;
  special_requests?: string;
  honeypot?: string;
}) {
  const res = await fetch(`${BASE}/public/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, restaurant_id: RID }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to submit reservation');
  }
  return res.json();
}

export async function getRestaurantInfo() {
  try {
    const res = await fetch(`${BASE}/public/restaurant-info?rid=${RID}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getPublicTables() {
  try {
    const res = await fetch(`${BASE}/public/tables?rid=${RID}`, {
      cache: 'no-store',
    });
    if (!res.ok) return { data: [] };
    return res.json();
  } catch {
    return { data: [] };
  }
}

export async function getPublicFeedback() {
  try {
    const res = await fetch(`${BASE}/public/feedback?rid=${RID}`, {
      cache: 'no-store',
    });
    if (!res.ok) return { data: [] };
    return res.json();
  } catch {
    return { data: [] };
  }
}

export async function createFeedback(body: {
  customer_name?: string;
  customer_phone?: string;
  rating: number;
  comments?: string;
  honeypot?: string;
}) {
  const res = await fetch(`${BASE}/public/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, restaurant_id: RID }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to submit feedback');
  }
  return res.json();
}
