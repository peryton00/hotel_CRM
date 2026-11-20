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
  const res = await fetch(`${BASE}/public/menu?rid=${RID}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error('Menu unavailable');
  }
  return res.json(); // { data: { categories: [...], items: [...] } }
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
  items: {
    menu_item_id: string;
    item_name: string;
    quantity: number;
    unit_price_paise: number;
    notes?: string;
  }[];
  notes?: string;
}) {
  try {
    const res = await fetch(`${BASE}/public/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, restaurant_id: RID }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error || err.message || 'Order failed';
      const isPosOffline = res.status === 409 || String(msg).includes('RESTAURANT_POS_OFFLINE');
      throw {
        status: res.status,
        message: msg,
        isPosOffline,
      };
    }
    return res.json();
  } catch (e: any) {
    if (e.isPosOffline) throw e;
    const isNetworkError = !e.status || e.name === 'TypeError' || String(e.message).includes('fetch');
    throw {
      status: e.status || 503,
      message: e.message || 'Failed to place order. Restaurant system may be offline.',
      isPosOffline: isNetworkError || e.status === 409,
    };
  }
}

export async function getCustomerOrders(phone: string, tableId?: string) {
  try {
    let url = `${BASE}/public/orders?rid=${RID}&phone=${encodeURIComponent(phone)}`;
    if (tableId) {
      url += `&table_id=${encodeURIComponent(tableId)}`;
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
