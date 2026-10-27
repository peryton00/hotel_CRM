use crate::error::AppError;

pub struct InventoryService;

impl InventoryService {
    /// Normalize measurement units for conversion:
    /// Supported: kg <-> g, l <-> ml, pieces/pcs
    pub fn convert_quantity(qty: f64, from_unit: &str, to_unit: &str) -> Result<f64, AppError> {
        let from = from_unit.trim().to_lowercase();
        let to = to_unit.trim().to_lowercase();

        if from == to {
            return Ok(qty);
        }

        match (from.as_str(), to.as_str()) {
            ("kg", "g") => Ok(qty * 1000.0),
            ("g", "kg") => Ok(qty / 1000.0),
            ("l", "ml") | ("liter", "ml") | ("litre", "ml") => Ok(qty * 1000.0),
            ("ml", "l") | ("ml", "liter") | ("ml", "litre") => Ok(qty / 1000.0),
            _ => Err(AppError::BadRequest(format!(
                "Incompatible unit conversion from '{}' to '{}'",
                from_unit, to_unit
            ))),
        }
    }

    /// Calculate wastage cost impact in paise: quantity * cost_per_unit_paise
    pub fn calculate_wastage_cost(quantity: f64, cost_per_unit_paise: i64) -> i64 {
        if quantity <= 0.0 || cost_per_unit_paise <= 0 {
            0
        } else {
            (quantity * cost_per_unit_paise as f64).round() as i64
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unit_conversions() {
        assert_eq!(
            InventoryService::convert_quantity(2.5, "kg", "g").unwrap(),
            2500.0
        );
        assert_eq!(
            InventoryService::convert_quantity(500.0, "g", "kg").unwrap(),
            0.5
        );
        assert_eq!(
            InventoryService::convert_quantity(1.0, "l", "ml").unwrap(),
            1000.0
        );
        assert!(InventoryService::convert_quantity(1.0, "kg", "ml").is_err());
    }

    #[test]
    fn test_wastage_cost_impact() {
        // 2.5 units at Rs 40.00 (4000 paise) = 10000 paise (Rs 100.00)
        let cost = InventoryService::calculate_wastage_cost(2.5, 4000);
        assert_eq!(cost, 10000);
    }
}
