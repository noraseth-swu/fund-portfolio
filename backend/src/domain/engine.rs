use super::models::{
    HoldingPosition, PlatformSummary, PortfolioSummary, Transaction, TransactionType,
};
use rust_decimal::Decimal;
use std::collections::HashMap;

pub struct CalculationEngine;

/// ข้อมูล NAV ล่าสุด: (Fund Abbr, Fund Name TH, NAV, NAV Date YYYY-MM-DD)
pub type NavInfo = (String, Option<String>, Decimal, Option<String>);
pub type NavMap = HashMap<String, NavInfo>;

impl CalculationEngine {
    /// คำนวณสรุปพอร์ตการลงทุนจากประวัติธุรกรรมทั้งหมดและราคา NAV ล่าสุด
    ///
    /// - `transactions`: รายการธุรกรรมทั้งหมด (เรียงตามวันที่เก่า -> ใหม่)
    /// - `nav_map`: Mapping จาก proj_id -> (Fund Abbr, Fund Name TH, Latest NAV, Latest NAV Date)
    pub fn calculate_portfolio(
        mut transactions: Vec<Transaction>,
        nav_map: &NavMap,
    ) -> PortfolioSummary {
        // เรียงลำดับธุรกรรมตามวันที่ (เก่าไปใหม่) เพื่อให้การคำนวณ Cost Basis ถูกต้อง
        transactions.sort_by(|a, b| a.trans_date.cmp(&b.trans_date));

        // Key: (proj_id, platform_str)
        struct PositionTracker {
            proj_id: String,
            fund_abbr: String,
            fund_name_th: Option<String>,
            platform: String,
            units: Decimal,
            total_cost: Decimal,
            realized_pl: Decimal,
            dividend: Decimal,
            last_unit_price: Decimal,
        }

        let mut trackers: HashMap<(String, String), PositionTracker> = HashMap::new();

        for tx in transactions {
            let platform_str = tx.platform.as_str().to_string();
            let key = (tx.proj_id.clone(), platform_str.clone());

            let (abbr, name_th, _, _) = nav_map.get(&tx.proj_id).cloned().unwrap_or_else(|| {
                (
                    tx.fund_abbr.clone().unwrap_or_else(|| tx.proj_id.clone()),
                    None,
                    Decimal::ZERO,
                    None,
                )
            });

            let tracker = trackers.entry(key).or_insert_with(|| PositionTracker {
                proj_id: tx.proj_id.clone(),
                fund_abbr: abbr,
                fund_name_th: name_th,
                platform: platform_str,
                units: Decimal::ZERO,
                total_cost: Decimal::ZERO,
                realized_pl: Decimal::ZERO,
                dividend: Decimal::ZERO,
                last_unit_price: Decimal::ZERO,
            });

            if tx.unit_price > Decimal::ZERO {
                tracker.last_unit_price = tx.unit_price;
            }

            match tx.trans_type {
                TransactionType::Buy => {
                    // ป้องกันค่า units หรือ amount ที่ส่งมาติดลบ
                    let buy_units = tx.units.abs();
                    let buy_cost = tx.total_amount.abs() + tx.fee.abs();
                    tracker.units += buy_units;
                    tracker.total_cost += buy_cost;
                }
                TransactionType::Sell => {
                    let units_to_sell = tx.units.abs();
                    if tracker.units > Decimal::ZERO {
                        let avg_cost = tracker.total_cost / tracker.units;
                        let cost_of_units_sold = units_to_sell * avg_cost;
                        let net_proceeds = tx.total_amount.abs() - tx.fee.abs();

                        // Realized P/L = เงินที่ได้จากการขายสุทธิ - ต้นทุนของหน่วยที่ขาย
                        let gain_loss = net_proceeds - cost_of_units_sold;
                        tracker.realized_pl += gain_loss;

                        if units_to_sell >= tracker.units {
                            tracker.units = Decimal::ZERO;
                            tracker.total_cost = Decimal::ZERO;
                        } else {
                            tracker.units -= units_to_sell;
                            tracker.total_cost -= cost_of_units_sold;
                        }
                    }
                }
                TransactionType::Dividend => {
                    tracker.dividend += tx.total_amount.abs();
                }
            }
        }

        // แปลงเป็น HoldingPosition พร้อมคำนวณ Market Value และ Unrealized P/L
        let mut holdings: Vec<HoldingPosition> = Vec::new();
        let mut portfolio_cost = Decimal::ZERO;
        let mut portfolio_market_val = Decimal::ZERO;
        let mut portfolio_realized = Decimal::ZERO;
        let mut portfolio_dividend = Decimal::ZERO;

        let mut platform_groups: HashMap<String, (Decimal, Decimal, Decimal)> = HashMap::new(); // (cost, market_val, realized)

        for (_, mut tracker) in trackers {
            let (mut current_nav, nav_date) = nav_map
                .get(&tracker.proj_id)
                .map(|(_, _, nav, date)| (*nav, date.clone()))
                .unwrap_or((Decimal::ZERO, None));

            // Fallback: หากยังไม่มีข้อมูล NAV ล่าสุดจาก SEC ให้ใช้ราคาต่อหน่วยล่าสุดจากธุรกรรม หรือต้นทุนเฉลี่ย
            if current_nav <= Decimal::ZERO {
                if tracker.last_unit_price > Decimal::ZERO {
                    current_nav = tracker.last_unit_price;
                } else if tracker.units > Decimal::ZERO && tracker.total_cost > Decimal::ZERO {
                    current_nav = (tracker.total_cost / tracker.units).round_dp(4);
                }
            }

            // ป้องกันหน่วยติดลบ
            if tracker.units <= Decimal::ZERO {
                tracker.units = Decimal::ZERO;
                tracker.total_cost = Decimal::ZERO;
            }

            let avg_cost = if tracker.units > Decimal::ZERO {
                (tracker.total_cost / tracker.units).round_dp(4)
            } else {
                Decimal::ZERO
            };

            let market_value = if tracker.units > Decimal::ZERO {
                (tracker.units * current_nav).round_dp(2).max(Decimal::ZERO)
            } else {
                Decimal::ZERO
            };
            let unrealized_pl = if tracker.units > Decimal::ZERO {
                market_value - tracker.total_cost
            } else {
                Decimal::ZERO
            };

            let unrealized_pl_pct = if tracker.total_cost > Decimal::ZERO {
                ((unrealized_pl / tracker.total_cost) * Decimal::from(100)).round_dp(2)
            } else {
                Decimal::ZERO
            };

            if tracker.units > Decimal::ZERO {
                portfolio_cost += tracker.total_cost;
                portfolio_market_val += market_value;
            }
            portfolio_realized += tracker.realized_pl;
            portfolio_dividend += tracker.dividend;

            // รวบรวมข้อมูลตามแพลตฟอร์ม
            let entry = platform_groups.entry(tracker.platform.clone()).or_insert((
                Decimal::ZERO,
                Decimal::ZERO,
                Decimal::ZERO,
            ));
            if tracker.units > Decimal::ZERO {
                entry.0 += tracker.total_cost;
                entry.1 += market_value;
            }
            entry.2 += tracker.realized_pl;

            // แสดงเฉพาะรายการที่ยังมีหน่วยลงทุน หรือมี Realized P/L
            if tracker.units > Decimal::ZERO || tracker.realized_pl != Decimal::ZERO {
                let is_stock = tracker.proj_id == "NVDA"
                    || tracker.fund_abbr.to_uppercase() == "NVDA"
                    || (!tracker.proj_id.starts_with('M')
                        && tracker.platform == "DIME"
                        && tracker.fund_abbr.len() <= 5
                        && tracker.fund_abbr.chars().all(|c| c.is_ascii_alphabetic()))
                    || (tracker.platform == "DIME"
                        && (tracker.fund_abbr == "K-USA(UH)" || tracker.fund_abbr == "M-MINVOL"));
                let asset_type = if is_stock {
                    "STOCK".to_string()
                } else {
                    "FUND".to_string()
                };

                let fund_name_th = if is_stock && tracker.fund_name_th.is_none() {
                    Some(format!("หุ้นสหรัฐฯ ({})", tracker.fund_abbr))
                } else {
                    tracker.fund_name_th
                };

                holdings.push(HoldingPosition {
                    proj_id: tracker.proj_id,
                    fund_abbr: tracker.fund_abbr,
                    fund_name_th,
                    platform: tracker.platform,
                    total_units: tracker.units.round_dp(4),
                    avg_cost,
                    total_cost: tracker.total_cost.round_dp(2),
                    current_nav,
                    nav_date,
                    asset_type,
                    market_value,
                    unrealized_pl: unrealized_pl.round_dp(2),
                    unrealized_pl_pct,
                    realized_pl: tracker.realized_pl.round_dp(2),
                    total_dividend: tracker.dividend.round_dp(2),
                });
            }
        }

        // เรียง holdings ตามมูลค่าตลาดจากมากไปน้อย
        holdings.sort_by_key(|a| std::cmp::Reverse(a.market_value));

        let total_unrealized_pl = portfolio_market_val - portfolio_cost;
        let total_unrealized_pl_pct = if portfolio_cost > Decimal::ZERO {
            ((total_unrealized_pl / portfolio_cost) * Decimal::from(100)).round_dp(2)
        } else {
            Decimal::ZERO
        };

        // สรุปรายแพลตฟอร์ม (KBank, ttb, Dime, SCB)
        let mut platforms: HashMap<String, PlatformSummary> = HashMap::new();
        for (plat, (cost, mval, rpl)) in platform_groups {
            let upl = mval - cost;
            let upl_pct = if cost > Decimal::ZERO {
                ((upl / cost) * Decimal::from(100)).round_dp(2)
            } else {
                Decimal::ZERO
            };
            let alloc_pct = if portfolio_market_val > Decimal::ZERO {
                ((mval / portfolio_market_val) * Decimal::from(100)).round_dp(2)
            } else {
                Decimal::ZERO
            };

            platforms.insert(
                plat.clone(),
                PlatformSummary {
                    platform: plat,
                    total_cost: cost.round_dp(2),
                    market_value: mval.round_dp(2),
                    unrealized_pl: upl.round_dp(2),
                    unrealized_pl_pct: upl_pct,
                    realized_pl: rpl.round_dp(2),
                    allocation_pct: alloc_pct,
                },
            );
        }

        PortfolioSummary {
            total_cost: portfolio_cost.round_dp(2),
            market_value: portfolio_market_val.round_dp(2),
            total_unrealized_pl: total_unrealized_pl.round_dp(2),
            total_unrealized_pl_pct,
            total_realized_pl: portfolio_realized.round_dp(2),
            total_dividend: portfolio_dividend.round_dp(2),
            holdings,
            platforms,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn test_dca_buy_and_unrealized_pl() {
        // ทดสอบการซื้อเฉลี่ย 2 ครั้ง และคำนวณกำไร/ขาดทุน
        let tx1 = Transaction {
            id: "tx-1".to_string(),
            idempotency_key: None,
            proj_id: "K-USA".to_string(),
            fund_abbr: Some("K-USA".to_string()),
            platform: super::super::models::Platform::KBank,
            trans_type: TransactionType::Buy,
            trans_date: "2026-01-01".to_string(),
            units: dec!(100),
            unit_price: dec!(10.0),
            total_amount: dec!(1000.0),
            fee: dec!(0),
            note: None,
        };

        let tx2 = Transaction {
            id: "tx-2".to_string(),
            idempotency_key: None,
            proj_id: "K-USA".to_string(),
            fund_abbr: Some("K-USA".to_string()),
            platform: super::super::models::Platform::KBank,
            trans_type: TransactionType::Buy,
            trans_date: "2026-02-01".to_string(),
            units: dec!(100),
            unit_price: dec!(12.0),
            total_amount: dec!(1200.0),
            fee: dec!(0),
            note: None,
        };

        // NAV ปัจจุบันอยู่ที่ 15.0
        let mut nav_map = HashMap::new();
        nav_map.insert(
            "K-USA".to_string(),
            (
                "K-USA".to_string(),
                Some("กองทุนเค ยูเอสเอ".to_string()),
                dec!(15.0),
                Some("2026-01-28".to_string()),
            ),
        );

        let summary = CalculationEngine::calculate_portfolio(vec![tx1, tx2], &nav_map);

        assert_eq!(summary.total_cost, dec!(2200.0));
        assert_eq!(summary.market_value, dec!(3000.0)); // 200 units * 15.0 = 3000
        assert_eq!(summary.total_unrealized_pl, dec!(800.0)); // 3000 - 2200 = 800
        assert_eq!(summary.total_unrealized_pl_pct, dec!(36.36)); // 800 / 2200 * 100 = 36.36%
        assert_eq!(summary.holdings[0].avg_cost, dec!(11.0)); // 2200 / 200 = 11.0
    }

    #[test]
    fn test_partial_sell_and_realized_pl() {
        // ซื้อ 100 หน่วย @ 10 = 1,000 บาท
        let tx_buy = Transaction {
            id: "tx-buy".to_string(),
            idempotency_key: None,
            proj_id: "SCBGOLD".to_string(),
            fund_abbr: Some("SCBGOLD".to_string()),
            platform: super::super::models::Platform::Dime,
            trans_type: TransactionType::Buy,
            trans_date: "2026-01-01".to_string(),
            units: dec!(100),
            unit_price: dec!(10.0),
            total_amount: dec!(1000.0),
            fee: dec!(0),
            note: None,
        };

        // ขาย 50 หน่วย @ 12 = 600 บาท (กำไร 100 บาท)
        let tx_sell = Transaction {
            id: "tx-sell".to_string(),
            idempotency_key: None,
            proj_id: "SCBGOLD".to_string(),
            fund_abbr: Some("SCBGOLD".to_string()),
            platform: super::super::models::Platform::Dime,
            trans_type: TransactionType::Sell,
            trans_date: "2026-02-01".to_string(),
            units: dec!(50),
            unit_price: dec!(12.0),
            total_amount: dec!(600.0),
            fee: dec!(0),
            note: None,
        };

        let mut nav_map = HashMap::new();
        nav_map.insert(
            "SCBGOLD".to_string(),
            (
                "SCBGOLD".to_string(),
                None,
                dec!(13.0),
                Some("2026-02-01".to_string()),
            ),
        );

        let summary = CalculationEngine::calculate_portfolio(vec![tx_buy, tx_sell], &nav_map);

        assert_eq!(summary.total_realized_pl, dec!(100.0)); // ขายได้กำไร 100
        assert_eq!(summary.total_cost, dec!(500.0)); // เหลือต้นทุน 50 หน่วย @ 10 = 500
        assert_eq!(summary.market_value, dec!(650.0)); // 50 หน่วย * 13 = 650
        assert_eq!(summary.total_unrealized_pl, dec!(150.0)); // 650 - 500 = 150
    }

    #[test]
    fn test_fallback_to_transaction_unit_price_when_nav_zero() {
        let tx = Transaction {
            id: "tx-fallback".to_string(),
            idempotency_key: None,
            proj_id: "EASTSPRING-US-TECH".to_string(),
            fund_abbr: Some("EASTSPRING-US-TECH".to_string()),
            platform: super::super::models::Platform::Ttb,
            trans_type: TransactionType::Buy,
            trans_date: "2023-12-28".to_string(),
            units: dec!(46.0992),
            unit_price: dec!(13.5577),
            total_amount: dec!(625.0),
            fee: dec!(0),
            note: None,
        };

        // nav_map ว่างเปล่า หรือให้ค่า 0
        let nav_map = HashMap::new();
        let summary = CalculationEngine::calculate_portfolio(vec![tx], &nav_map);

        assert_eq!(summary.holdings[0].current_nav, dec!(13.5577));
        assert_eq!(summary.holdings[0].market_value, dec!(625.0));
        assert_eq!(summary.holdings[0].unrealized_pl, dec!(0.0));
        assert_eq!(summary.total_cost, dec!(625.0));
        assert_eq!(summary.market_value, dec!(625.0));
    }

    #[test]
    fn test_compute_idempotency_key_deterministic() {
        let key1 = Transaction::compute_idempotency_key(
            "user_123",
            "TTB",
            "M0001",
            Some("ES-USTECH"),
            "2023-12-28",
            "BUY",
            &dec!(46.0992),
            &dec!(625.00),
            Some("023362010997256"),
        );

        let key2 = Transaction::compute_idempotency_key(
            "user_123",
            "ttb",
            "m0001",
            Some("ES-USTECH"),
            "2023-12-28",
            "buy",
            &dec!(46.0992),
            &dec!(625.0),
            Some("023362010997256"),
        );

        // Case-insensitivity for platform & type, same reference note -> Identical hash!
        assert_eq!(key1, key2);

        // Different user -> Different hash!
        let key3 = Transaction::compute_idempotency_key(
            "user_999",
            "TTB",
            "M0001",
            Some("ES-USTECH"),
            "2023-12-28",
            "BUY",
            &dec!(46.0992),
            &dec!(625.00),
            Some("023362010997256"),
        );
        assert_ne!(key1, key3);
    }
}
