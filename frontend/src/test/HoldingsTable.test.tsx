import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HoldingsTable, DEFAULT_HOLDINGS_COLUMNS, type HoldingsColumnKey } from '../components/HoldingsTable';
import { I18nProvider } from '../lib/i18n';
import type { HoldingPosition } from '../lib/api';

const mockHoldings: HoldingPosition[] = [
  {
    proj_id: 'M0643_2555',
    fund_abbr: 'SCBS&P500E',
    fund_name_th: 'กองทุนเปิดไทยพาณิชย์หุ้นยูเอส',
    platform: 'SCB',
    total_units: '22.3608',
    avg_cost: '44.7211',
    total_cost: '1000.00',
    current_nav: '44.7211',
    nav_date: '2026-10-28',
    asset_type: 'FUND',
    market_value: '1000.00',
    unrealized_pl: '0.00',
    unrealized_pl_pct: '0.00',
    realized_pl: '0.00',
    total_dividend: '0.00',
  },
  {
    proj_id: 'PVD_01',
    fund_abbr: 'PF7103',
    fund_name_th: 'กองทุนสำรองเลี้ยงชีพ ตราสารหนี้',
    platform: 'KBank (PVD)',
    total_units: '9491.0802',
    avg_cost: '18.2500',
    total_cost: '173211.00',
    current_nav: '23.4558',
    nav_date: '2026-09-30',
    asset_type: 'PVD',
    market_value: '222618.90',
    unrealized_pl: '49407.90',
    unrealized_pl_pct: '28.52',
    realized_pl: '0.00',
    total_dividend: '0.00',
  },
];

describe('HoldingsTable', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders table with default columns and holdings', () => {
    render(
      <I18nProvider>
        <HoldingsTable
          holdings={mockHoldings}
          selectedPlatform="ALL"
          onSelectPlatform={vi.fn()}
          activePlatforms={['SCB', 'KBank (PVD)']}
          selectedAssetType="ALL"
          onSelectAssetType={vi.fn()}
          isPrivacyMode={false}
          userId="user_123"
          onViewHistory={vi.fn()}
        />
      </I18nProvider>
    );

    // Fund names rendered
    expect(screen.getByText('SCBS&P500E')).toBeInTheDocument();
    expect(screen.getByText('PF7103')).toBeInTheDocument();
    // Default columns exist
    expect(screen.getAllByRole('columnheader')).toHaveLength(DEFAULT_HOLDINGS_COLUMNS.length);
  });

  it('reorders columns via drag and drop and persists to localStorage', () => {
    const userId = 'user_test_drag';
    render(
      <I18nProvider>
        <HoldingsTable
          holdings={mockHoldings}
          selectedPlatform="ALL"
          onSelectPlatform={vi.fn()}
          activePlatforms={['SCB']}
          selectedAssetType="ALL"
          onSelectAssetType={vi.fn()}
          isPrivacyMode={false}
          userId={userId}
          onViewHistory={vi.fn()}
        />
      </I18nProvider>
    );

    const headers = screen.getAllByRole('columnheader');
    const firstHeader = headers[0]; // 'fund'
    const thirdHeader = headers[2]; // 'total_units'

    // Simulate drag start on 'fund' and drop on 'total_units'
    fireEvent.dragStart(firstHeader, {
      dataTransfer: {
        setData: vi.fn(),
        effectAllowed: 'move',
      },
    });

    fireEvent.dragOver(thirdHeader, {
      dataTransfer: { dropEffect: 'move' },
    });

    fireEvent.drop(thirdHeader);

    // Verify localStorage was updated
    const saved = localStorage.getItem(`fund_portfolio_holdings_col_order_${userId}`);
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved!);
    // 'fund' should have moved from index 0 to index 2
    expect(parsed[2]).toBe('fund');
  });

  it('restores column order from localStorage on mount', () => {
    const userId = 'user_restored';
    const customOrder: HoldingsColumnKey[] = [
      'market_value',
      'fund',
      'platform',
      'total_units',
      'avg_cost',
      'total_cost',
      'current_nav',
      'unrealized_pl',
      'realized_pl',
      'actions',
    ];
    localStorage.setItem(
      `fund_portfolio_holdings_col_order_${userId}`,
      JSON.stringify(customOrder)
    );

    render(
      <I18nProvider>
        <HoldingsTable
          holdings={mockHoldings}
          selectedPlatform="ALL"
          onSelectPlatform={vi.fn()}
          activePlatforms={['SCB']}
          selectedAssetType="ALL"
          onSelectAssetType={vi.fn()}
          isPrivacyMode={false}
          userId={userId}
          onViewHistory={vi.fn()}
        />
      </I18nProvider>
    );

    const headers = screen.getAllByRole('columnheader');
    // First header should now be Market Value (Thai or English)
    expect(headers[0]).toHaveTextContent(/Market Value|มูลค่าปัจจุบัน/);
  });

  it('resets columns to default when reset button is clicked', () => {
    const userId = 'user_reset';
    const customOrder: HoldingsColumnKey[] = [
      'actions',
      'fund',
      'platform',
      'total_units',
      'avg_cost',
      'total_cost',
      'current_nav',
      'market_value',
      'unrealized_pl',
      'realized_pl',
    ];
    localStorage.setItem(
      `fund_portfolio_holdings_col_order_${userId}`,
      JSON.stringify(customOrder)
    );

    render(
      <I18nProvider>
        <HoldingsTable
          holdings={mockHoldings}
          selectedPlatform="ALL"
          onSelectPlatform={vi.fn()}
          activePlatforms={['SCB']}
          selectedAssetType="ALL"
          onSelectAssetType={vi.fn()}
          isPrivacyMode={false}
          userId={userId}
          onViewHistory={vi.fn()}
        />
      </I18nProvider>
    );

    // Reset button is present when isCustomOrder is true
    const resetBtn = screen.getByTitle(/Reset Column Order|รีเซ็ตลำดับคอลัมน์/i);
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(resetBtn);

    // localStorage should be cleared
    expect(localStorage.getItem(`fund_portfolio_holdings_col_order_${userId}`)).toBeNull();
    // First header should be 'Fund / Asset' again
    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]).toHaveTextContent(/Fund \/ Asset|กองทุน \/ สินทรัพย์/);
  });
});
