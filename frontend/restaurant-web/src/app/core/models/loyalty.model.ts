import { LoyaltyTier } from './customer.model';

export interface LoyaltyTierConfig {
  tier: LoyaltyTier;
  minVisits?: number;
  minSpend: number;
  pointsPer100Inr: number;
  discountPercent: number;
  perks: string;
}

export const DEFAULT_LOYALTY_TIERS: LoyaltyTierConfig[] = [
  {
    tier: 'BRONZE',
    minVisits: 1,
    minSpend: 0,
    pointsPer100Inr: 10,
    discountPercent: 0,
    perks: 'Welcome Diner • 1-2 visits • 10 pts per ₹100 • Complimentary beverage on 2nd visit',
  },
  {
    tier: 'SILVER',
    minVisits: 3,
    minSpend: 5000,
    pointsPer100Inr: 15,
    discountPercent: 5,
    perks: 'Regular Guest • 3-4 visits • 5% off dine-in • Complimentary signature dessert',
  },
  {
    tier: 'GOLD',
    minVisits: 5,
    minSpend: 15000,
    pointsPer100Inr: 20,
    discountPercent: 10,
    perks: 'Loyal Guest • 5-9 visits • 10% off bill • Priority table seating • Free chef appetizer',
  },
  {
    tier: 'PLATINUM',
    minVisits: 10,
    minSpend: 35000,
    pointsPer100Inr: 30,
    discountPercent: 15,
    perks:
      'VIP Legend • 10+ visits • 15% off bill • Reserved table guarantee • Chef tasting invitations',
  },
];

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  customerName: string;
  type: 'EARNED' | 'REDEEMED' | 'ADJUSTED';
  points: number;
  description: string;
  date: string;
}

export interface LoyaltyMilestoneRewardConfig {
  pointsCouponCode?: string;
  tierVisits?: Record<string, number>;
  targetVisits: number;
  rewardType: 'PERCENT_DISCOUNT' | 'FLAT_DISCOUNT' | 'FREE_MEAL';
  discountPercent?: number;
  flatDiscountPaise?: number;
  maxDiscountPaise?: number;
  minBillPaise?: number;
  couponCode: string;
  title: string;
  description: string;
  isActive: boolean;
}

export const DEFAULT_MILESTONE_REWARD: LoyaltyMilestoneRewardConfig = {
  targetVisits: 7,
  rewardType: 'PERCENT_DISCOUNT',
  discountPercent: 50,
  maxDiscountPaise: 50000,
  minBillPaise: 0,
  couponCode: 'VISIT7FREE',
  title: '7th Visit Celebration Reward',
  description:
    'Enjoy 50% OFF your bill (up to ₹500) as a special thank-you on your 7th dining visit.',
  isActive: true,
};

export function visitTiers(overrides?: Record<string, number>) {
  return DEFAULT_LOYALTY_TIERS.map(({ tier, minVisits }) => ({
    tier,
    minVisits: overrides?.[tier] ?? minVisits ?? 0,
  })).sort((a, b) => a.minVisits - b.minVisits);
}

export function visitTier(visits: number, overrides?: Record<string, number>) {
  return (
    visitTiers(overrides)
      .reverse()
      .find((tier) => visits >= tier.minVisits)?.tier ?? 'BRONZE'
  );
}
