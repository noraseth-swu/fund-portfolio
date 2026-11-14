use super::models::{HoldingPosition, PlatformSummary, PortfolioSummary, Transaction, TransactionType};
use rust_decimal::Decimal;
use std::collections::HashMap;

pub struct CalculationEngine;

impl CalculationEngine {
    /// คำนวณสรุปพอร์ตการลงทุนจากประวัติธุรกรรมทั้งหมดและราคา NAV ล่าสุด
    ///
    /// - `transactions`: รายการธุรกรรมทั้งหมด (เรียงตามวันที่เก่า -> ใหม่)
    /// - `nav_map`: Mapping จาก proj_id -> (Fund Abbr, Fund Name TH, Latest NAV)
    pub fn calculate_portfolio(
        mut transactions: Vec<Transaction>,
        nav_map: &HashMap<String, (String, Option<String>, Decimal)>,
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
        }

        let mut trackers: HashMap<(String, String), PositionTracker> = HashMap::new();

        for tx in transactions {
            let platform_str = tx.platform.as_str().to_string();
            let key = (tx.proj_id.clone(), platform_str.clone());

            let (abbr, name_th, _) = nav_map
                .get(&tx.proj_id)
                .cloned()
                .unwrap_or_else(|| (tx.fund_abbr.clone().unwrap_or_else(|| tx.proj_id.clone()), None, Decimal::ZERO));

            let tracker = trackers.entry(key).or_insert_with(|| PositionTracker {
                proj_id: tx.proj_id.clone(),
                fund_abbr: abbr,
                fund_name_th: name_th,
                platform: platform_str,
                units: Decimal::ZERO,
                total_cost: Decimal::ZERO,
                realized_pl: Decimal::ZERO,
                dividend: Decimal::ZERO,
            });

            match tx.trans_type {
                TransactionType::Buy => {
                    // ต้นทุนที่ซื้อรวมค่าธรรมเนียม
                    let buy_cost = tx.total_amount + tx.fee;
                    tracker.units += tx.units;
                    tracker.total_cost += buy_cost;
                }
                TransactionType::Sell => {
                    if tracker.units > Decimal::ZERO {
                        let avg_cost = tracker.total_cost / tracker.units;
                        let cost_of_units_sold = tx.units * avg_cost;
                        let net_proceeds = tx.total_amount - tx.fee;

                        // Realized P/L = เงินที่ได้จากการขายสุทธิ - ต้นทุนของหน่วยที่ขาย
                        let gain_loss = net_proceeds - cost_of_units_sold;
                        tracker.realized_pl += gain_loss;

                        tracker.units -= tx.units;
                        if tracker.units <= Decimal::ZERO {
                            tracker.units = Decimal::ZERO;
                            tracker.total_cost = Decimal::ZERO;
                        } else {
                            tracker.total_cost -= cost_of_units_sold;
                        }
                    }
                }
                TransactionType::Dividend => {
                    tracker.dividend += tx.total_amount;
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

        for (_, tracker) in trackers {
            let current_nav = nav_map
                .get(&tracker.proj_id)
                .map(|(_, _, nav)| *nav)
                .unwrap_or(Decimal::ZERO);

            let avg_cost = if tracker.units > Decimal::ZERO {
                (tracker.total_cost / tracker.units).round_dp(4)
            } else {
                Decimal::ZERO
            };

            let market_value = (tracker.units * current_nav).round_dp(2);
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

            portfolio_cost += tracker.total_cost;
            portfolio_market_val += market_value;
            portfolio_realized += tracker.realized_pl;
            portfolio_dividend += tracker.dividend;

            // รวบรวมข้อมูลตามแพลตฟอร์ม
            let entry = platform_groups.entry(tracker.platform.clone()).or_insert((Decimal::ZERO, Decimal::ZERO, Decimal::ZERO));
            entry.0 += tracker.total_cost;
            entry.1 += market_value;
            entry.2 += tracker.realized_pl;

            // แสดงเฉพาะรายการที่ยังมีหน่วยลงทุน หรือมี Realized P/L
            if tracker.units > Decimal::ZERO || tracker.realized_pl != Decimal::ZERO {
                holdings.push(HoldingPosition {
                    proj_id: tracker.proj_id,
                    fund_abbr: tracker.fund_abbr,
                    fund_name_th: tracker.fund_name_th,
                    platform: tracker.platform,
                    total_units: tracker.units.round_dp(4),
                    avg_cost,
                    total_cost: tracker.total_cost.round_dp(2),
                    current_nav,
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
        nav_map.insert("K-USA".to_string(), ("K-USA".to_string(), Some("กองทุนเค ยูเอสเอ".to_string()), dec!(15.0)));

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
        nav_map.insert("SCBGOLD".to_string(), ("SCBGOLD".to_string(), None, dec!(13.0)));

        let summary = CalculationEngine::calculate_portfolio(vec![tx_buy, tx_sell], &nav_map);

        assert_eq!(summary.total_realized_pl, dec!(100.0)); // ขายได้กำไร 100
        assert_eq!(summary.total_cost, dec!(500.0)); // เหลือต้นทุน 50 หน่วย @ 10 = 500
        assert_eq!(summary.market_value, dec!(650.0)); // 50 หน่วย * 13 = 650
        assert_eq!(summary.total_unrealized_pl, dec!(150.0)); // 650 - 500 = 150
    }
}
