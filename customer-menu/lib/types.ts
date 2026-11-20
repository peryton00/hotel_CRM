export interface MenuCategory {
  id: string;
  name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
}

export interface MenuItem {
  id: string;
  category_id?: string;
  name: string;
  description?: string;
  base_price_paise: number;
  tax_rate_percent: number;
  is_veg: boolean;
  is_available: boolean;
  image_url?: string;
  preparation_time_minutes?: number;
}

export interface CartItem {
  item: MenuItem;
  quantity: number;
  notes?: string;
}

export interface TableInfo {
  id: string;
  table_number: string;
  section: string;
  status: string;
  ordering_enabled: boolean;
  gst_rate?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  service_charge_rate?: number;
  restaurant_phone?: string;
  is_pos_online?: boolean;
  restaurant_status?: string;
}

export interface RestaurantStatus {
  restaurant_id: string;
  is_pos_online: boolean;
  restaurant_status: 'ONLINE' | 'OFFLINE';
  phone?: string;
  message: string;
}

export interface CustomerPastOrderItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price_paise: number;
  subtotal_paise: number;
  status: string;
  notes?: string;
}

export interface CustomerPastOrder {
  id?: string;
  order_number?: string;
  status?: string;
  payment_status?: string;
  table_id?: string;
  total_amount_paise?: number;
  subtotal_paise?: number;
  tax_paise?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  discount_paise?: number;
  created_at?: string;
  notes?: string;
  customer_name?: string;
  customer_phone?: string;
  items?: CustomerPastOrderItem[];
  order?: {
    id: string;
    order_number: string;
    status: string;
    payment_status: string;
    table_id?: string;
    total_amount_paise: number;
    subtotal_paise: number;
    tax_paise?: number;
    cgst_rate?: number;
    sgst_rate?: number;
    discount_paise?: number;
    created_at: string;
    notes?: string;
    customer_name?: string;
    customer_phone?: string;
  };
}
