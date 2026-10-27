# Data Model Specification

All monetary values are modeled in Indian Rupees (INR, major unit, standard 2 decimal precision calculation) with integer or floating point handling avoiding rounding bugs.

## Core Entities & Relationships

### 1. Restaurant
- `id`: string (UUID)
- `slug`: string (e.g., `"gurukripa-dhaba"`)
- `name`: string (`"GuruKripa Dhaba"`)
- `tagline`: string
- `description`: string
- `address`: `{ street: string, city: string, state: string, zip: string }`
- `contact`: `{ phone: string, email: string, website: string }`
- `openingHours`: `{ days: string, hours: string }[]`
- `currency`: `"INR"`
- `currencySymbol`: `"₹"`
- `taxSettings`: `{ gstRate: number, serviceTaxRate: number, enableGst: boolean, gstNumber: string }`
- `orderingSettings`: `{ dineInEnabled: boolean, minOrderAmount: number }`

### 2. Table
- `id`: string (UUID)
- `number`: string (e.g. `"T-01"`, `"07"`)
- `capacity`: number
- `section`: `"Main Dining"` | `"Terrace Garden"` | `"Private Lounge"` | `"Bar"`
- `status`: `"AVAILABLE"` | `"OCCUPIED"` | `"RESERVED"` | `"DIRTY"`
- `qrToken`: string (opaque token, e.g. `"tbl-tok-7a8f1"`)
- `qrUrl`: string
- `orderingEnabled`: boolean

### 3. Customer
- `id`: string (UUID)
- `name`: string
- `phone`: string (e.g. `"+91 98765 43210"`)
- `email`?: string
- `customerSince`: string (ISO 8601)
- `visitCount`: number
- `lastVisit`: string (ISO 8601)
- `totalSpend`: number
- `avgOrderValue`: number
- `status`: `"ACTIVE"` | `"VIP"` | `"INACTIVE"`
- `loyaltyTier`: `"BRONZE"` | `"SILVER"` | `"GOLD"` | `"PLATINUM"`
- `loyaltyPoints`: number
- `assignedCouponIds`: string[]

### 4. MenuCategory & MenuItem
**MenuCategory**:
- `id`: string
- `name`: string
- `slug`: string
- `icon`?: string
- `sortOrder`: number
- `isActive`: boolean

**MenuItem**:
- `id`: string
- `categoryId`: string
- `name`: string
- `description`: string
- `price`: number
- `imageUrl`: string
- `isAvailable`: boolean
- `dietary`: `"VEG"` | `"NON_VEG"` | `"EGG"` | `"VEGAN"`
- `prepTimeMinutes`: number
- `portionSizes`?: `{ label: string, price: number }[]`
- `variantGroups`?: `{ id: string, name: string, required: boolean, minSelect?: number, maxSelect?: number, options: { id: string, name: string, priceDelta: number }[] }[]`
- `addonGroups`?: `{ id: string, name: string, options: { id: string, name: string, priceDelta: number }[] }[]`
- `isChefSpecial`?: boolean
- `isPopular`?: boolean

### 5. Cart & Order
**OrderItem**:
- `id`: string
- `menuItemId`: string
- `name`: string
- `selectedPortion`?: { label: string, price: number }
- `selectedVariants`: { groupName: string, optionName: string, priceDelta: number }[]
- `selectedAddons`: { name: string, priceDelta: number }[]
- `unitPrice`: number
- `quantity`: number
- `itemTotal`: number
- `specialInstructions`?: string

**Order**:
- `id`: string
- `orderNumber`: string (e.g. `"#ORD-2026-1042"`)
- `restaurantSlug`: string
- `tableId`: string
- `tableNumber`: string
- `customerId`?: string
- `customerName`: string
- `customerPhone`: string
- `items`: OrderItem[]
- `subtotal`: number
- `discountAmount`: number
- `appliedCouponCode`?: string
- `taxAmount`: number
- `cgstAmount`: number
- `sgstAmount`: number
- `totalAmount`: number
- `status`: `"PENDING"` | `"ACCEPTED"` | `"PREPARING"` | `"READY"` | `"SERVED"` | `"COMPLETED"` | `"CANCELLED"`
- `paymentStatus`: `"UNPAID"` | `"PAID"` | `"REFUNDED"`
- `paymentMethod`?: `"CASH"` | `"UPI"` | `"CARD"`
- `createdAt`: string (ISO 8601)
- `updatedAt`: string (ISO 8601)
- `timeline`: `{ status: string, timestamp: string, note?: string }[]`

### 6. Coupon & CouponRedemption
- `id`: string
- `code`: string (e.g. `"ROYAL20"`, `"TASTE50"`)
- `name`: string
- `description`: string
- `discountType`: `"PERCENTAGE"` | `"FIXED"`
- `discountValue`: number
- `minOrderValue`: number
- `maxDiscountAmount`?: number
- `validFrom`: string (ISO 8601)
- `validUntil`: string (ISO 8601)
- `assignedCustomerIds`?: string[]
- `usageLimit`: number
- `perCustomerLimit`: number
- `redemptionCount`: number
- `isActive`: boolean

### 7. Invoice & Billing
- `id`: string
- `invoiceNumber`: string (e.g. `"INV-2026-0891"`)
- `orderId`: string
- `orderNumber`: string
- `tableNumber`: string
- `customerName`: string
- `customerPhone`: string
- `issuedAt`: string (ISO 8601)
- `items`: OrderItem[]
- `subtotal`: number
- `discount`: number
- `taxBreakdown`: `{ name: string, rate: number, amount: number }[]`
- `total`: number
- `paymentStatus`: `"PAID"` | `"UNPAID"`
- `printedAt`?: string
