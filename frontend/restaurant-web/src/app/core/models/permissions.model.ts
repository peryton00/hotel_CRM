export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
  group: 'POS & Billing' | 'Kitchen & KOT' | 'Menu' | 'Inventory' | 'Reports' | 'Administration';
}

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  // POS & Billing
  {
    key: 'pos:orders:create',
    label: 'Create & take orders',
    description: 'Add items and modify table orders',
    group: 'POS & Billing',
  },
  {
    key: 'pos:bills:settle',
    label: 'Settle bills & collect payments',
    description: 'Process payments and close bills',
    group: 'POS & Billing',
  },
  {
    key: 'pos:discounts:apply',
    label: 'Apply discounts & coupons',
    description: 'Apply discount percentages and coupons',
    group: 'POS & Billing',
  },
  {
    key: 'pos:orders:void',
    label: 'Cancel & void active orders',
    description: 'Void items or cancel orders',
    group: 'POS & Billing',
  },

  // Kitchen & KOT
  {
    key: 'kitchen:kot:fire',
    label: 'Send orders to kitchen (KOT)',
    description: 'Print or dispatch KOT to kitchen',
    group: 'Kitchen & KOT',
  },
  {
    key: 'kitchen:kds:view',
    label: 'Kitchen Display (KDS)',
    description: 'View and update KDS preparation statuses',
    group: 'Kitchen & KOT',
  },

  // Menu
  {
    key: 'menu:items:edit',
    label: 'Edit menu items & prices',
    description: 'Update dishes, ingredients and prices',
    group: 'Menu',
  },
  {
    key: 'menu:availability:toggle',
    label: 'Toggle item availability',
    description: 'Mark items In-stock or Out-of-stock (86)',
    group: 'Menu',
  },

  // Inventory
  {
    key: 'inventory:view',
    label: 'View raw material inventory',
    description: 'Check ingredient levels and reorder alerts',
    group: 'Inventory',
  },
  {
    key: 'inventory:adjust',
    label: 'Adjust stock & wastage',
    description: 'Record wastage and inventory adjustments',
    group: 'Inventory',
  },

  // Reports
  {
    key: 'reports:sales:view',
    label: 'View daily sales & orders',
    description: 'Access order volume and daily metrics',
    group: 'Reports',
  },
  {
    key: 'reports:financials:view',
    label: 'View gross margin & revenue',
    description: 'Access financial calculations and tax figures',
    group: 'Reports',
  },

  // Administration
  {
    key: 'staff:manage',
    label: 'Manage staff & attendance',
    description: 'Register staff, view attendance and payroll',
    group: 'Administration',
  },
  {
    key: 'settings:edit',
    label: 'Edit restaurant settings',
    description: 'Update restaurant details, GSTIN and printers',
    group: 'Administration',
  },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ['*'],
  MANAGER: [
    'pos:orders:create',
    'pos:bills:settle',
    'pos:discounts:apply',
    'pos:orders:void',
    'kitchen:kot:fire',
    'kitchen:kds:view',
    'menu:items:edit',
    'menu:availability:toggle',
    'inventory:view',
    'inventory:adjust',
    'reports:sales:view',
    'reports:financials:view',
  ],
  CASHIER: [
    'pos:orders:create',
    'pos:bills:settle',
    'kitchen:kot:fire',
    'menu:availability:toggle',
  ],
  CAPTAIN: [
    'pos:orders:create',
    'kitchen:kot:fire',
  ],
  SERVICE_CREW: [
    'pos:orders:create',
    'kitchen:kot:fire',
  ],
  EXECUTIVE_CHEF: [
    'kitchen:kot:fire',
    'kitchen:kds:view',
    'menu:availability:toggle',
    'inventory:view',
    'inventory:adjust',
  ],
  SOUS_CHEF: [
    'kitchen:kot:fire',
    'kitchen:kds:view',
    'menu:availability:toggle',
    'inventory:view',
  ],
  BEVERAGE_SPECIALIST: [
    'kitchen:kot:fire',
    'kitchen:kds:view',
    'menu:availability:toggle',
  ],
};
