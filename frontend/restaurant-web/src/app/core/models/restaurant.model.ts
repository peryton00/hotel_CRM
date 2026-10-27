export interface RestaurantAddress {
  street: string;
  area?: string;
  city: string;
  state: string;
  zip: string;
  landmark?: string;
}

export interface RestaurantContact {
  phone: string;
  email: string;
  website: string;
}

export interface OpeningHour {
  days: string;
  hours: string;
}

export interface TaxSettings {
  enableGst: boolean;
  cgstRate: number; // e.g. 2.5
  sgstRate: number; // e.g. 2.5
  serviceChargeRate: number; // e.g. 5.0
  gstNumber: string;
}

export interface OrderingSettings {
  dineInEnabled: boolean;
  takeawayEnabled: boolean;
  minOrderAmount: number;
  estimatedPrepMinutes: number;
}

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  coverImage: string;
  logoUrl: string;
  cuisine: string[];
  rating: number;
  reviewCount: number;
  address: RestaurantAddress;
  contact: RestaurantContact;
  openingHours: OpeningHour[];
  currency: 'INR' | string;
  currencySymbol: '₹' | string;
  taxSettings: TaxSettings;
  orderingSettings: OrderingSettings;
}
