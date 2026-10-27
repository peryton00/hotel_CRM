import { LoyaltyTier } from './customer.model';

export interface LoyaltyTierConfig {
  tier: LoyaltyTier;
  minSpend: number;
  pointsPer100Inr: number;
  discountPercent: number;
  perks: string;
}

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  customerName: string;
  type: 'EARNED' | 'REDEEMED' | 'ADJUSTED';
  points: number;
  description: string;
  date: string;
}
