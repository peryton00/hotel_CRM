export type DietaryType = 'VEG' | 'NON_VEG' | 'EGG' | 'VEGAN';

export interface PortionSize {
  label: string;
  price: number;
}

export interface VariantOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface VariantGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect?: number;
  maxSelect?: number;
  options: VariantOption[];
}

export interface AddonOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface AddonGroup {
  id: string;
  name: string;
  options: AddonOption[];
}

export interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  isAvailable: boolean;
  dietary: DietaryType;
  prepTimeMinutes: number;
  isPopular?: boolean;
  isChefSpecial?: boolean;
  portionSizes?: PortionSize[];
  variantGroups?: VariantGroup[];
  addonGroups?: AddonGroup[];
}
