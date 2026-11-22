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
  current_seating_session_id?: string;
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

export interface Coupon {
  id: string;
  code: string;
  title?: string;
  description?: string;
  discount_type: 'PERCENTAGE' | 'FIXED';
  discount_value: number;
  min_order_amount_paise?: number;
  max_discount_amount_paise?: number;
  is_active: boolean;
}

export interface PublicReservationInput {
  customer_name: string;
  customer_phone: string;
  guest_count: number;
  reservation_time: string;
  special_requests?: string;
  honeypot?: string;
}

export interface PublicFeedbackInput {
  customer_name?: string;
  customer_phone?: string;
  rating: number;
  comments?: string;
  honeypot?: string;
}

export interface PublicReview {
  id: string;
  customer_name?: string;
  rating: number;
  comments?: string;
  resolution_note?: string;
  created_at: string;
}

export interface RestaurantInfo {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  currency_symbol: string;
  gst_rate: number;
  service_charge_rate: number;
  google_review_url?: string;
  is_pos_online: boolean;
  restaurant_status: 'ONLINE' | 'OFFLINE';
}

export interface PublicTableSummary {
  id: string;
  number: string;
  table_number?: string;
  section: string;
  capacity: number;
  status: string;
  ordering_enabled: boolean;
  token: string;
}
