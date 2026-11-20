'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { CartItem, MenuItem } from './types';

interface CartCtx {
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

  // Load from session storage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('customer_cart');
      if (saved) {
        setItems(JSON.parse(saved));
      }
    } catch {}
  }, []);

  // Save to session storage
  useEffect(() => {
    try {
      sessionStorage.setItem('customer_cart', JSON.stringify(items));
    } catch {}
  }, [items]);

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
      sessionStorage.removeItem('customer_cart');
    } catch {}
  };

  const total = items.reduce((s, i) => s + i.item.base_price_paise * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <Ctx.Provider value={{ items, add, remove, update, clear, total, count }}>
      {children}
    </Ctx.Provider>
  );
}

export const useCart = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used within CartProvider');
  return c;
};
