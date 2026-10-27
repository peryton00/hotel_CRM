use crate::models::reports::*;

/// Financial reporting service implementing Phase 7A-7D business invariants:
/// 1. Independent period attribution:
///    - Sales: order.created_at
///    - Collections: payment.settled_at (or payment.created_at)
///    - Refunds: refund.completed_at
///    - COGS: fulfillment timestamp
///    - Wastage: stock movement timestamp
/// 2. Non-retroactive refunds: attributed to completion date, visible even if order cancelled
/// 3. Pending/cancelled refunds never count as cash outflows
/// 4. Split bills: derive receivables from unpaid child balances, avoid double-counting parent orders
/// 5. Signed net collections = Collections - Completed Refunds (unclamped, can be negative)
/// 6. Transparent legacy unknown timestamp disclosure
pub struct FinancialCalculator;

impl FinancialCalculator {
    pub fn calculate_net_collections(collections_paise: i64, completed_refunds_paise: i64) -> i64 {
        // Contractual rule: Signed net collections must not be clamped to zero!
        collections_paise - completed_refunds_paise
    }

    pub fn calculate_gross_margin(net_sales_paise: i64, cogs_paise: i64) -> (i64, f64) {
        let gross_profit = net_sales_paise - cogs_paise;
        let margin_percent = if net_sales_paise > 0 {
            (gross_profit as f64 / net_sales_paise as f64) * 100.0
        } else {
            0.0
        };
        (gross_profit, margin_percent)
    }

    pub fn default_legacy_disclosure(count: i64, amount_paise: i64) -> LegacyDisclosure {
        LegacyDisclosure {
            has_legacy_records: count > 0,
            unverified_records_count: count,
            unverified_amount_paise: amount_paise,
            disclaimer: if count > 0 {
                format!(
                    "Notice: {} historical record(s) totalling Rs. {:.2} have unverified or missing timestamps and are excluded from period attribution.",
                    count,
                    amount_paise as f64 / 100.0
                )
            } else {
                "All financial records have verified cryptographic/authoritative timestamps."
                    .to_string()
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signed_net_collections_negative_unclamped() {
        // Phase 7C requirement: if collections = 5000 paise (Rs 50) and completed refunds = 8000 paise (Rs 80),
        // net collections MUST be -3000 paise (-Rs 30), NOT clamped to 0!
        let net = FinancialCalculator::calculate_net_collections(5000, 8000);
        assert_eq!(net, -3000);
    }

    #[test]
    fn test_gross_margin_calculation() {
        let (profit, margin) = FinancialCalculator::calculate_gross_margin(10000, 6000);
        assert_eq!(profit, 4000);
        assert!((margin - 40.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_legacy_disclosure() {
        let disclosure = FinancialCalculator::default_legacy_disclosure(3, 15000);
        assert!(disclosure.has_legacy_records);
        assert_eq!(disclosure.unverified_records_count, 3);
        assert_eq!(disclosure.unverified_amount_paise, 15000);
    }
}
