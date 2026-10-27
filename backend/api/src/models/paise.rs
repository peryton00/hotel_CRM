use serde::{Deserialize, Serialize};

/// Integer paise arithmetic utility.
/// 1 Rupee = 100 Paise.
/// All monetary figures are stored and processed strictly as i64 paise.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Paise(pub i64);

impl Paise {
    pub const ZERO: Paise = Paise(0);

    pub fn from_rupees(rupees: f64) -> Self {
        Paise((rupees * 100.0).round() as i64)
    }

    pub fn to_rupees(&self) -> f64 {
        self.0 as f64 / 100.0
    }

    /// Calculate percentage discount or tax in exact integer paise
    pub fn percentage(&self, percent: f64) -> Paise {
        if percent <= 0.0 {
            return Paise(0);
        }
        let result = (self.0 as f64 * percent / 100.0).round() as i64;
        Paise(result)
    }

    /// Split an amount equally across `ways` parts.
    /// Remainder paise are distributed to the first remainder parts so sum(splits) == total.
    /// Example: 1000 paise split 3 ways -> [334, 333, 333]. Sum = 1000.
    pub fn split_equally(&self, ways: usize) -> Vec<Paise> {
        if ways == 0 {
            return vec![];
        }
        let base = self.0 / ways as i64;
        let remainder = (self.0 % ways as i64).unsigned_abs() as usize;

        let mut results = Vec::with_capacity(ways);
        for i in 0..ways {
            let part = if i < remainder {
                if self.0 >= 0 {
                    base + 1
                } else {
                    base - 1
                }
            } else {
                base
            };
            results.push(Paise(part));
        }
        results
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_paise_conversions() {
        assert_eq!(Paise::from_rupees(10.50).0, 1050);
        assert_eq!(Paise(1050).to_rupees(), 10.50);
        assert_eq!(Paise::from_rupees(0.0).0, 0);
    }

    #[test]
    fn test_equal_split_with_remainder() {
        // 1000 paise (Rs 10.00) split 3 ways: 334, 333, 333
        let splits = Paise(1000).split_equally(3);
        assert_eq!(splits, vec![Paise(334), Paise(333), Paise(333)]);
        let sum: i64 = splits.iter().map(|p| p.0).sum();
        assert_eq!(sum, 1000);

        // 100 paise split 7 ways
        let splits_7 = Paise(100).split_equally(7);
        assert_eq!(splits_7.len(), 7);
        let sum_7: i64 = splits_7.iter().map(|p| p.0).sum();
        assert_eq!(sum_7, 100);
    }

    #[test]
    fn test_percentage_calculation() {
        // 10% of 1050 paise = 105 paise
        assert_eq!(Paise(1050).percentage(10.0).0, 105);
        // 5% GST on 1250 paise = 62.5 -> rounds to 63 paise
        assert_eq!(Paise(1250).percentage(5.0).0, 63);
    }
}
