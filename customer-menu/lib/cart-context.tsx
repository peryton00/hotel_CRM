'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { CartItem, MenuItem } from './types';

interface CartCtx {
  selectSession: (token: string, session?: string) => void;
  items: CartItem[];
  add: (item: MenuItem) => void;
  remove: (id: string) => void;
  update: (id: string, qty: number) => void;
  clear: () => void;
  total: number; // in paise
  count: number;
}

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [storageKey, setStorageKey] = useState('');
  const selectSession = useCallback((token: string, session?: string) => {
    const key = `guest-cart:${token}:${session || 'browse'}`;
    if (key === storageKey) return;
    let restored: CartItem[] = [];
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || '[]');
      if (Array.isArray(saved)) restored = saved.filter(line => line?.item?.id && Number.isSafeInteger(line.quantity) && line.quantity > 0);
    } catch {}
    setItems(restored);
    setStorageKey(key);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(items)); } catch {}
  }, [storageKey, items]);

  const add = (item: MenuItem) =>
    setItems((prev) => {
      const ex = prev.find((i) => i.item.id === item.id);
      return ex
        ? prev.map((i) => (i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i))
        : [...prev, { item, quantity: 1 }];
    });

  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.item.id !== id));

  const update = (id: string, qty: number) =>
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.item.id !== id)
        : prev.map((i) => (i.item.id === id ? { ...i, quantity: qty } : i))
    );

  const clear = () => {
    setItems([]);
    try {
      if (storageKey) sessionStorage.removeItem(storageKey);
    } catch {}
  };

  const total = items.reduce((s, i) => s + i.item.base_price_paise * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <Ctx.Provider value={{ selectSession, items, add, remove, update, clear, total, count }}>
      {children}
    </Ctx.Provider>
  );
}

export const useCart = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used within CartProvider');
  return c;
};
