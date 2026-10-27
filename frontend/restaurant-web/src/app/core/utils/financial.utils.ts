import { Order } from '../models/order.model';
import { SplitBill, RefundRecord } from '../models/billing.model';
import {
  Recipe,
  Ingredient,
  StockMovement,
  MeasurementUnit,
  convertUnit,
  roundStock,
} from '../models/inventory.model';
import { DateRangeFilter, isTimestampInRange } from './date-range.utils';

export interface FinancialSummary {
  /** Gross sales: Total billed order value (net of discounts, inclusive of taxes) across non-cancelled orders */
  grossSales: number;
  /** Gross sales before promotional discounts (reconstructed: totalAmount + discountAmount) */
  grossSalesBeforeDiscounts: number;
  /** Total promotional discounts on non-cancelled orders */
  totalDiscounts: number;
  /** Net sales: Recognized sales performance across non-cancelled orders (equals billed totalAmount) */
  netSales: number;
  /** Total payments actually collected from settled non-cancelled orders & settled split bills in period */
  collectedRevenue: number;
  /** Total value of completed refunds for non-cancelled orders in period */
  totalRefunds: number;
  /** Net collections: signed difference (collectedRevenue - totalRefunds), not clamped to zero */
  netCollections: number;
  /** Net revenue: backward-compatible synonym for netCollections */
  netRevenue: number;
  /** Outstanding receivables from non-cancelled orders that are unpaid or partially settled */
  outstandingReceivables: number;
  /** Total tax (CGST + SGST) on non-cancelled orders */
  totalTax: number;
  /** Number of orders with status === 'SERVED' || status === 'COMPLETED' */
  fulfilledOrdersCount: number;
  /** Number of non-cancelled orders that are fully paid */
  paidOrdersCount: number;
  /** Number of orders with status === 'CANCELLED' */
  cancelledOrdersCount: number;
  /** Number of completed refund records in scope */
  completedRefundsCount: number;
  /** Average Order Value based on net collections and paid orders count */
  averageOrderValue: number;
  /** Transparency flag: true if any settled order in scope used legacy timestamp fallback */
  hasEstimatedSettlements: boolean;
}

export interface SettlementTimestampResult {
  timestamp: string | null;
  source:
    | 'EXPLICIT_SETTLED_AT'
    | 'TIMELINE_EVENT'
    | 'LEGACY_FALLBACK'
    | 'LEGACY_UNVERIFIED'
    | 'UNSETTLED';
  isEstimated: boolean;
}

/**
 * Resolves the authoritative settlement timestamp for a whole order.
 * Priority:
 * 1. Explicit `order.settledAt`
 * 2. Timeline event where `status === 'PAID'`
 * 3. Fallback for legacy paid orders: `order.updatedAt` or `order.createdAt` (marked as estimated fallback)
 * Returns timestamp: null if order is not settled.
 */
export function getOrderSettlementTimestamp(
  order: Order,
  allowLegacyFallback = true,
): SettlementTimestampResult {
  if (order.settledAt && !isNaN(new Date(order.settledAt).getTime())) {
    return {
      timestamp: order.settledAt,
      source: 'EXPLICIT_SETTLED_AT',
      isEstimated: false,
    };
  }

  if (order.timeline && order.timeline.length > 0) {
    const paidEvent = [...order.timeline].reverse().find((e) => e.status === 'PAID');
    if (paidEvent?.timestamp && !isNaN(new Date(paidEvent.timestamp).getTime())) {
      return {
        timestamp: paidEvent.timestamp,
        source: 'TIMELINE_EVENT',
        isEstimated: false,
      };
    }
  }

  if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'REFUNDED') {
    return {
      timestamp: null,
      source: 'UNSETTLED',
      isEstimated: false,
    };
  }

  // Legacy fallback if marked PAID/REFUNDED but lacks explicit settlement timestamp
  if (allowLegacyFallback) {
    const fallback = order.updatedAt || order.createdAt;
    if (fallback && !isNaN(new Date(fallback).getTime())) {
      return {
        timestamp: fallback,
        source: 'LEGACY_FALLBACK',
        isEstimated: true,
      };
    }
  }

  return {
    timestamp: null,
    source: 'LEGACY_UNVERIFIED',
    isEstimated: true,
  };
}

/**
 * Resolves the authoritative settlement timestamp for a child split bill.
 * Priority:
 * 1. Explicit `splitBill.settledAt`
 * 2. Legacy paid split without reliable settlement timestamp: labeled estimated with timestamp null.
 * Strictly does NOT treat `splitBill.createdAt` as verified payment timestamp.
 * Never silently substitutes an unrelated parent order timestamp for an individual split payment.
 * Does not fabricate settlement dates so legacy splits cannot silently appear as verified cash flow in daily reports.
 */
export function getSplitSettlementTimestamp(
  splitBill: SplitBill,
  parentOrder?: Order,
  allowLegacyFallback = true,
): SettlementTimestampResult {
  if (splitBill.settledAt && !isNaN(new Date(splitBill.settledAt).getTime())) {
    return {
      timestamp: splitBill.settledAt,
      source: 'EXPLICIT_SETTLED_AT',
      isEstimated: false,
    };
  }

  if (splitBill.paymentStatus !== 'PAID' && splitBill.paymentStatus !== 'REFUNDED') {
    return {
      timestamp: null,
      source: 'UNSETTLED',
      isEstimated: false,
    };
  }

  // Legacy paid split lacking authoritative settlement timestamp
  // Never treat createdAt as payment timestamp; do not fabricate dates
  return {
    timestamp: null,
    source: 'LEGACY_UNVERIFIED',
    isEstimated: true,
  };
}

/**
 * Resolves the authoritative completion timestamp for a refund record.
 * Only COMPLETED refunds represent an actual cash outflow.
 * Attributed to `refund.completedAt` if available, falling back to `refund.createdAt`
 * for legacy completed records where completion happened at creation.
 * Returns null for PENDING, CANCELLED, or invalid timestamps.
 */
export function getRefundCompletionTimestamp(refund: RefundRecord): string | null {
  if (refund.status !== 'COMPLETED') {
    return null;
  }
  const ts = refund.completedAt || refund.createdAt;
  if (!ts || isNaN(new Date(ts).getTime())) {
    return null;
  }
  return ts;
}

/**
 * Pure, authoritative financial metrics calculation.
 * Uses integer-paise calculations to avoid floating-point drift.
 * Separate eligibility rules:
 * - Sales performance: order intake timestamp (o.createdAt). Cancelled orders excluded.
 * - Collections: actual settlement timestamp (settledAt / timeline PAID). Real money received.
 * - Refund outflows: completed refund timestamp (r.createdAt). Includes completed refunds on cancelled orders.
 * - Receivables: non-cancelled orders unpaid as of period end.
 * Subtracts completed refunds exactly once from collections (signed difference; not clamped to zero).
 * Does not count unpaid orders as collected revenue.
 * For split orders, authoritatively derives receivables from unpaid child balances.
 */
export function calculateFinancialSummary(
  orders: Order[],
  splitBills: SplitBill[] = [],
  refunds: RefundRecord[] = [],
  dateRangeFilter?: DateRangeFilter,
): FinancialSummary {
  // Idempotency: Deduplicate inputs defensively by unique identifier
  const uniqueOrders = Array.from(new Map(orders.map((o) => [o.id, o])).values());
  const uniqueSplits = Array.from(new Map(splitBills.map((s) => [s.id, s])).values());
  const uniqueRefunds = Array.from(new Map(refunds.map((r) => [r.id, r])).values());

  const orderIds = new Set(uniqueOrders.map((o) => o.id));

  const safePaise = (val: unknown): number => {
    const num = Number(val);
    return isNaN(num) ? 0 : Math.round(num * 100);
  };

  // 1. Sales Performance: Attributed strictly by order intake timestamp (o.createdAt)
  // Non-cancelled orders placed in the period define recognized sales
  const salesOrders = uniqueOrders.filter(
    (o) =>
      o.status !== 'CANCELLED' &&
      (!dateRangeFilter || isTimestampInRange(o.createdAt, dateRangeFilter)),
  );

  const grossSalesPaise = salesOrders.reduce((sum, o) => sum + safePaise(o.totalAmount), 0);

  const grossBeforeDiscountsPaise = salesOrders.reduce(
    (sum, o) => sum + safePaise((o.totalAmount || 0) + (o.discountAmount || 0)),
    0,
  );

  const discountPaise = salesOrders.reduce((sum, o) => sum + safePaise(o.discountAmount), 0);

  const netSalesPaise = grossSalesPaise;

  // 2. Collections: Attributed strictly by actual settlement timestamp
  // Cash collections reflect real money received and are evaluated across all orders in scope.
  // Cancelling an order does NOT infer that money already collected or refunded was reversed.
  // However, a cancelled order without payment/refund is not counted as collected cash.
  let collectedPaise = 0;
  let hasEstimatedSettlements = false;

  for (const ord of uniqueOrders) {
    const isCancelled = ord.status === 'CANCELLED';
    const orderSplits = uniqueSplits.filter((b) => b.orderId === ord.id);
    const hasSplits = ord.isSplit || orderSplits.length > 0;
    const orderRefunds = uniqueRefunds.filter(
      (r) => r.orderId === ord.id && r.status === 'COMPLETED',
    );
    const hasCompletedRefund = orderRefunds.length > 0;

    // A cancelled order without any completed refund or explicit settlement did not collect cash
    if (isCancelled && !hasCompletedRefund && !ord.settledAt) {
      continue;
    }

    if (hasSplits) {
      // Split order: authoritatively count settled split bills attributed by split settlement timestamp
      const settledSplits = orderSplits.filter(
        (b) => b.paymentStatus === 'PAID' || b.paymentStatus === 'REFUNDED',
      );
      for (const sp of settledSplits) {
        const settlement = getSplitSettlementTimestamp(sp, ord);
        if (settlement.isEstimated) {
          hasEstimatedSettlements = true;
        }
        if (dateRangeFilter && dateRangeFilter.preset !== 'all') {
          // In a specific reporting period, require verified settlement timestamp within the range
          if (!settlement.timestamp || !isTimestampInRange(settlement.timestamp, dateRangeFilter)) {
            continue;
          }
        }
        collectedPaise += safePaise(sp.totalAmount);
      }
    } else if (ord.paymentStatus === 'PAID' || ord.paymentStatus === 'REFUNDED') {
      // Whole order payment
      const settlement = getOrderSettlementTimestamp(ord);
      if (settlement.isEstimated) {
        hasEstimatedSettlements = true;
      }
      if (dateRangeFilter && dateRangeFilter.preset !== 'all') {
        if (!settlement.timestamp || !isTimestampInRange(settlement.timestamp, dateRangeFilter)) {
          continue;
        }
      }
      collectedPaise += safePaise(ord.totalAmount);
    }
  }

  // 3. Completed Refunds: Completed refund outflows attributed strictly by actual completion timestamp.
  // Include every valid completed refund outflow even if the parent order was subsequently cancelled.
  // Exclude pending or cancelled refunds.
  const completedRefunds = uniqueRefunds.filter((r) => {
    if (r.status !== 'COMPLETED' || !orderIds.has(r.orderId)) return false;
    const completionTs = getRefundCompletionTimestamp(r);
    if (!completionTs) return false;
    return !dateRangeFilter || isTimestampInRange(completionTs, dateRangeFilter);
  });
  const totalRefundsPaise = completedRefunds.reduce((sum, r) => sum + safePaise(r.refundAmount), 0);

  // 4. Net Collections: Signed difference between collections and completed refund outflows
  const netRevenuePaise = collectedPaise - totalRefundsPaise;

  // 5. Outstanding Receivables: Evaluated on non-cancelled orders
  // Cancelled orders do not owe receivables.
  const nonCancelledOrders = uniqueOrders.filter((o) => o.status !== 'CANCELLED');
  const receivablesOrders = dateRangeFilter ? salesOrders : nonCancelledOrders;
  let outstandingPaise = 0;
  for (const ord of receivablesOrders) {
    const orderSplits = uniqueSplits.filter((b) => b.orderId === ord.id);
    const hasSplits = ord.isSplit || orderSplits.length > 0;

    if (hasSplits) {
      if (orderSplits.length > 0) {
        const unpaidSplits = orderSplits.filter((b) => {
          if (b.paymentStatus === 'UNPAID') return true;
          if (dateRangeFilter && dateRangeFilter.endMs) {
            const splitSettlement = getSplitSettlementTimestamp(b, ord);
            if (
              splitSettlement.timestamp &&
              new Date(splitSettlement.timestamp).getTime() > dateRangeFilter.endMs
            ) {
              return true;
            }
          }
          return false;
        });
        for (const sp of unpaidSplits) {
          outstandingPaise += safePaise(sp.totalAmount);
        }
      } else if (ord.paymentStatus === 'UNPAID') {
        outstandingPaise += safePaise(ord.totalAmount);
      }
    } else {
      let isUnpaidInPeriod = ord.paymentStatus === 'UNPAID';
      if (!isUnpaidInPeriod && dateRangeFilter && dateRangeFilter.endMs) {
        const orderSettlement = getOrderSettlementTimestamp(ord);
        if (
          orderSettlement.timestamp &&
          new Date(orderSettlement.timestamp).getTime() > dateRangeFilter.endMs
        ) {
          isUnpaidInPeriod = true;
        }
      }
      if (isUnpaidInPeriod) {
        outstandingPaise += safePaise(ord.totalAmount);
      }
    }
  }

  // 6. Tax, counts, and AOV
  const taxPaise = salesOrders.reduce((sum, o) => sum + safePaise(o.taxAmount), 0);
  const fulfilledOrdersCount = salesOrders.filter(
    (o) => o.status === 'SERVED' || o.status === 'COMPLETED',
  ).length;

  const paidOrders = salesOrders.filter((o) => {
    if (o.paymentStatus === 'PAID') {
      if (dateRangeFilter && dateRangeFilter.endMs) {
        const orderSettlement = getOrderSettlementTimestamp(o);
        if (
          orderSettlement.timestamp &&
          new Date(orderSettlement.timestamp).getTime() > dateRangeFilter.endMs
        ) {
          return false;
        }
      }
      return true;
    }
    const splits = uniqueSplits.filter((b) => b.orderId === o.id);
    return (
      splits.length > 0 &&
      splits.every((b) => {
        if (b.paymentStatus === 'PAID' || b.paymentStatus === 'REFUNDED') {
          if (dateRangeFilter && dateRangeFilter.endMs) {
            const splitSettlement = getSplitSettlementTimestamp(b, o);
            if (
              splitSettlement.timestamp &&
              new Date(splitSettlement.timestamp).getTime() > dateRangeFilter.endMs
            ) {
              return false;
            }
          }
          return true;
        }
        return false;
      })
    );
  });
  const paidOrdersCount = paidOrders.length;

  const averageOrderValue =
    paidOrdersCount > 0 ? Math.round(netRevenuePaise / paidOrdersCount) / 100 : 0;

  return {
    grossSales: Math.round(grossSalesPaise) / 100,
    grossSalesBeforeDiscounts: Math.round(grossBeforeDiscountsPaise) / 100,
    totalDiscounts: Math.round(discountPaise) / 100,
    netSales: Math.round(netSalesPaise) / 100,
    collectedRevenue: Math.round(collectedPaise) / 100,
    totalRefunds: Math.round(totalRefundsPaise) / 100,
    netCollections: Math.round(netRevenuePaise) / 100,
    netRevenue: Math.round(netRevenuePaise) / 100,
    outstandingReceivables: Math.round(outstandingPaise) / 100,
    totalTax: Math.round(taxPaise) / 100,
    fulfilledOrdersCount,
    paidOrdersCount,
    cancelledOrdersCount: uniqueOrders.filter(
      (o) =>
        o.status === 'CANCELLED' &&
        (!dateRangeFilter || isTimestampInRange(o.createdAt, dateRangeFilter)),
    ).length,
    completedRefundsCount: completedRefunds.length,
    averageOrderValue,
    hasEstimatedSettlements,
  };
}

export interface OrderTypeMetrics {
  ordersCount: number;
  paidOrdersCount: number;
  fulfilledOrdersCount: number;
  grossSales: number;
  totalDiscounts: number;
  netSales: number;
  collectedRevenue: number;
  netRevenue: number;
  netCollections: number;
  outstandingReceivables: number;
  averageOrderValue: number;
}

export interface OrderTypeBreakdown {
  dineIn: OrderTypeMetrics;
  takeaway: OrderTypeMetrics;
}

/**
 * Breakdown of financial figures segregated by order type (Dine-In vs Takeaway).
 * Follows identical strict GAAP rules via calculateFinancialSummary.
 */
export function calculateOrderTypeBreakdown(
  orders: Order[],
  splitBills: SplitBill[] = [],
  refunds: RefundRecord[] = [],
  dateRangeFilter?: DateRangeFilter,
): OrderTypeBreakdown {
  const takeawayOrders = orders.filter((o) => o.orderType === 'TAKEAWAY');
  const dineInOrders = orders.filter((o) => o.orderType !== 'TAKEAWAY');

  const dineInSummary = calculateFinancialSummary(
    dineInOrders,
    splitBills,
    refunds,
    dateRangeFilter,
  );
  const takeawaySummary = calculateFinancialSummary(
    takeawayOrders,
    splitBills,
    refunds,
    dateRangeFilter,
  );

  const dineInValidCount = dineInOrders.filter((o) => o.status !== 'CANCELLED').length;
  const takeawayValidCount = takeawayOrders.filter((o) => o.status !== 'CANCELLED').length;

  return {
    dineIn: {
      ordersCount: dineInValidCount,
      paidOrdersCount: dineInSummary.paidOrdersCount,
      fulfilledOrdersCount: dineInSummary.fulfilledOrdersCount,
      grossSales: dineInSummary.grossSales,
      totalDiscounts: dineInSummary.totalDiscounts,
      netSales: dineInSummary.netSales,
      collectedRevenue: dineInSummary.collectedRevenue,
      netRevenue: dineInSummary.netRevenue,
      netCollections: dineInSummary.netCollections,
      outstandingReceivables: dineInSummary.outstandingReceivables,
      averageOrderValue:
        dineInValidCount > 0
          ? Math.round((dineInSummary.netRevenue / dineInValidCount) * 100) / 100
          : 0,
    },
    takeaway: {
      ordersCount: takeawayValidCount,
      paidOrdersCount: takeawaySummary.paidOrdersCount,
      fulfilledOrdersCount: takeawaySummary.fulfilledOrdersCount,
      grossSales: takeawaySummary.grossSales,
      totalDiscounts: takeawaySummary.totalDiscounts,
      netSales: takeawaySummary.netSales,
      collectedRevenue: takeawaySummary.collectedRevenue,
      netRevenue: takeawaySummary.netRevenue,
      netCollections: takeawaySummary.netCollections,
      outstandingReceivables: takeawaySummary.outstandingReceivables,
      averageOrderValue:
        takeawayValidCount > 0
          ? Math.round((takeawaySummary.netRevenue / takeawayValidCount) * 100) / 100
          : 0,
    },
  };
}

// ============================================================================
// COGS AND GROSS PROFIT REPORTING TYPES & LOGIC
// ============================================================================

export type CogsCostStatus = 'VERIFIED' | 'ESTIMATED_NO_RECIPE' | 'ESTIMATED_INCOMPLETE_COST';

export interface CogsItemBreakdown {
  menuItemId: string;
  name: string;
  category: string;
  fulfilledQuantity: number;
  revenue: number;
  unitCogs: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
  status: CogsCostStatus;
  notes?: string;
}

export interface CogsSummary {
  /** Net revenue recognized from fulfilled & settled orders */
  netRevenue: number;
  /** Total Cost of Goods Sold from verified and estimated recipe consumption */
  totalCogs: number;
  /** Gross Profit = Net Revenue - Total COGS */
  grossProfit: number;
  /** Gross Margin Percentage = (Gross Profit / Net Revenue) * 100 (when Net Revenue > 0) */
  grossMarginPercentage: number;
  /** Total count of fulfilled individual dish portions in scope */
  fulfilledPortionsCount: number;
  /** Count of dishes that lacked active recipes or complete ingredient costs */
  untrackedOrEstimatedDishesCount: number;
  /** Breakdown by individual menu item */
  itemBreakdown: CogsItemBreakdown[];
  /** Explicit cost basis note */
  costBasis: 'CURRENT_BENCHMARK_COSTS';
  /** Reliability statement explaining that historical snapshots are not maintained */
  costBasisNotice: string;
}

/**
 * Resolves the authoritative fulfillment timestamp for an order.
 * Follows strict priority:
 * 1. Recipe consumption stock movement timestamp (if inventory was deducted upon fulfillment)
 * 2. Order timeline event for 'SERVED' or 'COMPLETED'
 * 3. Fallback: order.updatedAt if fulfilled, or order.createdAt
 * Returns null if the order is not in SERVED or COMPLETED status.
 */
export function getOrderFulfillmentTimestamp(
  order: Order,
  movements: StockMovement[] = [],
): string | null {
  if (order.status !== 'SERVED' && order.status !== 'COMPLETED') {
    return null;
  }

  // 1. Authoritative recipe consumption movement timestamp
  if (movements && movements.length > 0) {
    const consumptionMov = movements.find(
      (m) => m.type === 'RECIPE_CONSUMPTION' && m.referenceId === order.id,
    );
    if (consumptionMov?.timestamp) {
      return consumptionMov.timestamp;
    }
  }

  // 2. Timeline SERVED or COMPLETED event
  if (order.timeline && order.timeline.length > 0) {
    const fulfillmentEvent = [...order.timeline]
      .reverse()
      .find((e) => e.status === 'SERVED' || e.status === 'COMPLETED');
    if (fulfillmentEvent?.timestamp) {
      return fulfillmentEvent.timestamp;
    }
  }

  // 3. Fallback to order updatedAt or createdAt
  return order.updatedAt || order.createdAt || null;
}

/**
 * Calculates authoritative COGS, Gross Profit, and Gross Margins based on fulfilled orders,
 * active recipes, and recorded ingredient costs.
 *
 * Rules:
 * - Only fulfilled orders (status 'SERVED' or 'COMPLETED') represent consumed goods.
 * - Pending, preparing, or cancelled orders are strictly excluded from COGS.
 * - Missing recipes and incomplete ingredient costs are flagged honestly with 'ESTIMATED_*' status.
 * - Handles zero revenue safely (returns 0% margin, no NaN or Infinity).
 */
export function calculateCogsSummary(
  orders: Order[],
  recipes: Recipe[],
  ingredients: Ingredient[],
  splitBills: SplitBill[] = [],
  refunds: RefundRecord[] = [],
  stockMovements: StockMovement[] = [],
  dateRangeFilter?: DateRangeFilter,
): CogsSummary {
  // Fulfilled orders only: SERVED or COMPLETED
  let eligibleOrders = orders.filter((o) => o.status === 'SERVED' || o.status === 'COMPLETED');

  // Attribution by authoritative fulfillment timestamp if dateRangeFilter is active
  if (dateRangeFilter && dateRangeFilter.isValid) {
    eligibleOrders = eligibleOrders.filter((o) => {
      const fulfillmentTs = getOrderFulfillmentTimestamp(o, stockMovements);
      return fulfillmentTs ? isTimestampInRange(fulfillmentTs, dateRangeFilter) : false;
    });
  }

  // Deduplicate orders by id to ensure no order is counted twice
  const orderMap = new Map<string, Order>();
  for (const o of eligibleOrders) {
    orderMap.set(o.id, o);
  }
  const fulfilledOrders = Array.from(orderMap.values());

  const financial = calculateFinancialSummary(fulfilledOrders, splitBills, refunds);
  const netRevenue = financial.netRevenue;

  // Recipe lookup cache
  const recipeMap = new Map<string, Recipe>();
  for (const r of recipes) {
    if (r.isActive) {
      recipeMap.set(r.menuItemId, r);
    }
  }

  // Ingredient lookup cache
  const ingMap = new Map<string, Ingredient>();
  for (const ing of ingredients) {
    ingMap.set(ing.id, ing);
  }

  const itemAggMap = new Map<
    string,
    {
      menuItemId: string;
      name: string;
      category: string;
      quantity: number;
      revenuePaise: number;
      unitCogsPaise: number;
      totalCogsPaise: number;
      status: CogsCostStatus;
      notes?: string;
    }
  >();

  let totalCogsPaise = 0;
  let totalFulfilledPortions = 0;
  let untrackedDishesCount = 0;

  for (const ord of fulfilledOrders) {
    for (const item of ord.items) {
      totalFulfilledPortions += item.quantity;
      const existing = itemAggMap.get(item.menuItemId);

      if (!existing) {
        const recipe = recipeMap.get(item.menuItemId);
        let unitCogs = 0;
        let status: CogsCostStatus = 'VERIFIED';
        let notes = '';

        if (!recipe || !recipe.items || recipe.items.length === 0) {
          status = 'ESTIMATED_NO_RECIPE';
          notes = 'No active recipe registered for dish';
          untrackedDishesCount += 1;
        } else {
          let hasMissingIngredient = false;
          for (const rItem of recipe.items) {
            const ing = ingMap.get(rItem.ingredientId);
            if (!ing || typeof ing.costPerUnit !== 'number' || ing.costPerUnit <= 0) {
              hasMissingIngredient = true;
              notes = `Missing cost for ingredient '${ing?.name || rItem.ingredientId}'`;
              continue;
            }

            try {
              const convertedQty = convertUnit(rItem.quantity, rItem.unit, ing.costUnit);
              unitCogs += convertedQty * ing.costPerUnit;
            } catch (err: any) {
              hasMissingIngredient = true;
              notes = err.message || 'Unit conversion incompatible';
            }
          }

          if (hasMissingIngredient) {
            status = 'ESTIMATED_INCOMPLETE_COST';
            untrackedDishesCount += 1;
          }
        }

        const unitCogsPaise = Math.round(unitCogs * 100);
        const itemRevenuePaise = Math.round((item.itemTotal || 0) * 100);
        const itemTotalCogsPaise = unitCogsPaise * item.quantity;

        totalCogsPaise += itemTotalCogsPaise;

        itemAggMap.set(item.menuItemId, {
          menuItemId: item.menuItemId,
          name: item.name,
          category: 'Main Menu',
          quantity: item.quantity,
          revenuePaise: itemRevenuePaise,
          unitCogsPaise,
          totalCogsPaise: itemTotalCogsPaise,
          status,
          notes: notes || undefined,
        });
      } else {
        existing.quantity += item.quantity;
        const addRevenuePaise = Math.round((item.itemTotal || 0) * 100);
        const addCogsPaise = existing.unitCogsPaise * item.quantity;
        existing.revenuePaise += addRevenuePaise;
        existing.totalCogsPaise += addCogsPaise;
        totalCogsPaise += addCogsPaise;
      }
    }
  }

  const itemBreakdown: CogsItemBreakdown[] = Array.from(itemAggMap.values())
    .map((raw) => {
      const revenue = raw.revenuePaise / 100;
      const totalCogs = raw.totalCogsPaise / 100;
      const grossProfit = Math.round((revenue - totalCogs) * 100) / 100;
      const grossMarginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 100 * 10) / 10 : 0;

      return {
        menuItemId: raw.menuItemId,
        name: raw.name,
        category: raw.category,
        fulfilledQuantity: raw.quantity,
        revenue,
        unitCogs: raw.unitCogsPaise / 100,
        totalCogs,
        grossProfit,
        grossMarginPct,
        status: raw.status,
        notes: raw.notes,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const totalCogs = totalCogsPaise / 100;
  const grossProfit = Math.round((netRevenue - totalCogs) * 100) / 100;
  const grossMarginPercentage =
    netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 100 * 10) / 10 : 0;

  return {
    netRevenue,
    totalCogs,
    grossProfit,
    grossMarginPercentage,
    fulfilledPortionsCount: totalFulfilledPortions,
    untrackedOrEstimatedDishesCount: untrackedDishesCount,
    itemBreakdown,
    costBasis: 'CURRENT_BENCHMARK_COSTS',
    costBasisNotice:
      'COGS evaluated using active recipe benchmarks. Historical ingredient cost snapshots are not preserved in local state.',
  };
}

// ============================================================================
// WASTAGE ANALYSIS REPORTING TYPES & LOGIC
// ============================================================================

export interface WastageItemSummary {
  ingredientId: string;
  ingredientName: string;
  category: string;
  quantity: number;
  unit: MeasurementUnit;
  costPerUnit: number;
  totalValue: number;
  movementCount: number;
}

export interface WastageReasonSummary {
  reason: string;
  quantity: number;
  totalValue: number;
  movementCount: number;
}

export interface WastageSummary {
  totalWastageValue: number;
  totalMovementsCount: number;
  byIngredient: WastageItemSummary[];
  byReason: WastageReasonSummary[];
  movements: StockMovement[];
}

/**
 * Calculates auditable wastage totals and breakdowns from recorded stock movements.
 * Strictly filters by movement.type === 'WASTAGE'.
 */
export function calculateWastageSummary(
  movements: StockMovement[],
  ingredients: Ingredient[],
): WastageSummary {
  const wastageMovements = movements.filter((m) => m.type === 'WASTAGE');

  const ingMap = new Map<string, Ingredient>();
  for (const ing of ingredients) {
    ingMap.set(ing.id, ing);
  }

  let totalValuePaise = 0;
  const byIngMap = new Map<string, WastageItemSummary>();
  const byReasonMap = new Map<string, WastageReasonSummary>();

  for (const m of wastageMovements) {
    const ing = ingMap.get(m.ingredientId);
    const qty = Math.abs(m.quantityDelta);
    let movementCost = 0;

    if (ing && ing.costPerUnit && ing.costPerUnit > 0) {
      try {
        const converted = convertUnit(qty, m.unit, ing.costUnit);
        movementCost = converted * ing.costPerUnit;
      } catch {
        movementCost = qty * ing.costPerUnit;
      }
    }

    const costPaise = Math.round(movementCost * 100);
    totalValuePaise += costPaise;

    // By Ingredient
    const existingIng = byIngMap.get(m.ingredientId) || {
      ingredientId: m.ingredientId,
      ingredientName: m.ingredientName || ing?.name || 'Unknown Ingredient',
      category: ing?.category || 'OTHER',
      quantity: 0,
      unit: m.unit,
      costPerUnit: ing?.costPerUnit || 0,
      totalValue: 0,
      movementCount: 0,
    };
    existingIng.quantity = roundStock(existingIng.quantity + qty, 3);
    existingIng.totalValue = Math.round((existingIng.totalValue + movementCost) * 100) / 100;
    existingIng.movementCount += 1;
    byIngMap.set(m.ingredientId, existingIng);

    // By Reason
    const reasonKey = m.reason ? m.reason.trim() : 'Unspecified Wastage';
    const existingReason = byReasonMap.get(reasonKey) || {
      reason: reasonKey,
      quantity: 0,
      totalValue: 0,
      movementCount: 0,
    };
    existingReason.quantity = roundStock(existingReason.quantity + qty, 3);
    existingReason.totalValue = Math.round((existingReason.totalValue + movementCost) * 100) / 100;
    existingReason.movementCount += 1;
    byReasonMap.set(reasonKey, existingReason);
  }

  return {
    totalWastageValue: totalValuePaise / 100,
    totalMovementsCount: wastageMovements.length,
    byIngredient: Array.from(byIngMap.values()).sort((a, b) => b.totalValue - a.totalValue),
    byReason: Array.from(byReasonMap.values()).sort((a, b) => b.totalValue - a.totalValue),
    movements: wastageMovements,
  };
}
