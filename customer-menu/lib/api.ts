import { dinerHeaders } from './diner-session';
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
  if (typeof window !== 'undefined') {
    try {
      const cached = sessionStorage.getItem(`menu_${RID}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.expiresAt && Date.now() < parsed.expiresAt) {
          return parsed.data;
        }
      }
    } catch {}
  }
  try {
    const res = await fetch(`${BASE}/public/menu?rid=${RID}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      throw new Error("Menu is temporarily unavailable");
    }
    const data = await res.json();
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(
          `menu_${RID}`,
          JSON.stringify({ data, expiresAt: Date.now() + 10 * 60 * 1000 })
        );
      } catch {}
    }
    return data;
  } catch {
    throw new Error("Menu is temporarily unavailable");
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
  request_id: string;
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
      const isPosOffline = String(msg).includes('RESTAURANT_POS_OFFLINE');
      throw {
        status: res.status,
        message: String(msg),
        isPosOffline,
      };
    }
    const order = await res.json();
    try {
      const keys: string[] = JSON.parse(sessionStorage.getItem('guest-receipts') || '[]');
      sessionStorage.setItem('guest-receipts', JSON.stringify([body.request_id, ...keys.filter(key => key !== body.request_id)].slice(0, 50)));
    } catch {}
    return order;
  } catch (e: any) {
    if (e.isPosOffline) throw e;
    const isNetworkError = !e.status || e.name === 'TypeError' || String(e.message).includes('fetch');
    const msgStr = typeof e?.message === 'string' ? e.message : 'Failed to place order. Restaurant system may be offline.';
    throw {
      status: e.status || 503,
      message: msgStr,
      isPosOffline: isNetworkError,
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
    const keys: string[] = JSON.parse(sessionStorage.getItem('guest-receipts') || '[]');
    if (!keys.length) return { data: [] };
    const res = await fetch(url, { cache: 'no-store', headers: { 'x-order-receipts': keys.join(',') } });
    if (!res.ok) {
      return { data: [] };
    }
    return res.json();
  } catch {
    return { data: [] };
  }
}

export async function getCoupons(phone?: string) {
  try {
    let url = `${BASE}/public/coupons?rid=${RID}`;
    if (phone && phone.trim().length >= 10) {
      const clean = phone.replace(/\D/g, '');
      url += `&phone=${encodeURIComponent(clean)}`;
    }
    const res = await fetch(url, {
      cache: 'no-store', headers: dinerHeaders(phone),
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
    if (!dinerHeaders(clean).Authorization) return null;
    const res = await fetch(`${BASE}/public/customer/loyalty?rid=${RID}&phone=${encodeURIComponent(clean)}`, {
      cache: 'no-store', headers: dinerHeaders(phone),
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
      headers: { 'Content-Type': 'application/json', ...dinerHeaders(clean) },
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
  const res = await fetch(`${BASE}/public/tables?rid=${RID}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Table lookup unavailable');
  const result = await res.json();
  if (!Array.isArray(result?.data)) throw new Error('Invalid table list');
  return result;
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
