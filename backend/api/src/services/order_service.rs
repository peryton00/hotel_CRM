use crate::{
    error::AppError,
    models::{order::OrderStatus, paise::Paise},
};

pub struct BillBreakdown {
    pub subtotal_paise: i64,
    pub discount_paise: i64,
    pub taxable_amount_paise: i64,
    pub tax_paise: i64,
    pub service_charge_paise: i64,
    pub round_off_paise: i64,
    pub final_amount_paise: i64,
}

pub struct OrderService;

impl OrderService {
    /// Authoritative server-side bill computation with exact integer paise arithmetic.
    pub fn calculate_bill(
        subtotal_paise: i64,
        discount_paise: i64,
        tax_rate_percent: f64,
        service_charge_percent: f64,
        round_off_enabled: bool,
    ) -> BillBreakdown {
        let subtotal = Paise(subtotal_paise);
        let discount = Paise(discount_paise.min(subtotal_paise));
        let taxable = Paise(subtotal.0 - discount.0);

        let tax = taxable.percentage(tax_rate_percent);
        let service_charge = subtotal.percentage(service_charge_percent);

        let unrounded_total = taxable.0 + tax.0 + service_charge.0;

        let (round_off_paise, final_amount_paise) = if round_off_enabled {
            // Round to nearest Rupee (100 paise)
            let rounded_rupees = ((unrounded_total as f64) / 100.0).round() as i64;
            let rounded_paise = rounded_rupees * 100;
            let round_off = rounded_paise - unrounded_total;
            (round_off, rounded_paise)
        } else {
            (0, unrounded_total)
        };

        BillBreakdown {
            subtotal_paise: subtotal.0,
            discount_paise: discount.0,
            taxable_amount_paise: taxable.0,
            tax_paise: tax.0,
            service_charge_paise: service_charge.0,
            round_off_paise,
            final_amount_paise,
        }
    }

    /// Validates lifecycle transitions according to restaurant operational workflow.
    pub fn validate_status_transition(
        current_status: &str,
        new_status: &str,
    ) -> Result<(), AppError> {
        let current = OrderStatus::from(current_status.to_string());
        let target = OrderStatus::from(new_status.to_string());

        if current == target {
            return Ok(());
        }

        if current == OrderStatus::Completed {
            return Err(AppError::BadRequest(
                "Completed orders cannot transition to any other status.".to_string(),
            ));
        }

        if current == OrderStatus::Cancelled {
            return Err(AppError::BadRequest(
                "Cancelled orders cannot be reopened.".to_string(),
            ));
        }

        // Allow cancellation from any active status
        if target == OrderStatus::Cancelled {
            return Ok(());
        }

        let valid = match current {
            OrderStatus::Draft => matches!(target, OrderStatus::Confirmed),
            OrderStatus::Confirmed => {
                matches!(target, OrderStatus::InPreparation | OrderStatus::Ready)
            }
            OrderStatus::InPreparation => {
                matches!(target, OrderStatus::Ready | OrderStatus::Served)
            }
            OrderStatus::Ready => matches!(target, OrderStatus::Served | OrderStatus::Completed),
            OrderStatus::Served => matches!(target, OrderStatus::Completed),
            _ => false,
        };

        if !valid {
            return Err(AppError::BadRequest(format!(
                "Invalid order status transition from '{}' to '{}'.",
                current_status, new_status
            )));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bill_calculation_with_round_off() {
        // Subtotal: Rs 525.00 (52500 paise)
        // Discount: Rs 25.00 (2500 paise)
        // Tax: 5% on Rs 500.00 = Rs 25.00 (2500 paise)
        // Service charge: 0%
        // Final: 52500 paise
        let bill = OrderService::calculate_bill(52500, 2500, 5.0, 0.0, true);
        assert_eq!(bill.taxable_amount_paise, 50000);
        assert_eq!(bill.tax_paise, 2500);
        assert_eq!(bill.round_off_paise, 0);
        assert_eq!(bill.final_amount_paise, 52500);

        // Test with round off
        // Subtotal: 1055 paise. Tax: 5% on 1055 = 53 paise. Total = 1108 paise.
        // Nearest 100 paise = 1100 paise. Round off = -8 paise.
        let bill_round = OrderService::calculate_bill(1055, 0, 5.0, 0.0, true);
        assert_eq!(bill_round.tax_paise, 53);
        assert_eq!(bill_round.final_amount_paise, 1100);
        assert_eq!(bill_round.round_off_paise, -8);
    }

    #[test]
    fn test_status_transitions() {
        assert!(OrderService::validate_status_transition("draft", "confirmed").is_ok());
        assert!(OrderService::validate_status_transition("confirmed", "in_preparation").is_ok());
        assert!(OrderService::validate_status_transition("confirmed", "cancelled").is_ok());
        assert!(OrderService::validate_status_transition("completed", "draft").is_err());
        assert!(OrderService::validate_status_transition("cancelled", "confirmed").is_err());
    }
}
