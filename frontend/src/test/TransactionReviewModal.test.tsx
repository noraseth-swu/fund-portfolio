import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransactionReviewModal } from '../components/TransactionReviewModal';
import { I18nProvider } from '../lib/i18n';

vi.mock('../lib/api', () => ({
  getPendingTransactions: vi.fn().mockResolvedValue([
    {
      id: 'pt_1',
      platform: 'TTB',
      raw_fund_name: 'TMB-ES-SET50',
      fund_abbr: 'ES-SET50',
      match_confidence: 'EXACT',
      trans_type: 'BUY',
      trans_date: '2026-03-01',
      units: '100.0000',
      unit_price: '15.5000',
      total_amount: '1550.00',
      source_file: 'ttb_statement.pdf',
    },
    {
      id: 'pt_2',
      platform: 'DIME',
      raw_fund_name: 'SCBS&P500FUND',
      fund_abbr: 'SCBS&P500FUND',
      match_confidence: 'EXACT',
      trans_type: 'BUY',
      trans_date: '2026-03-02',
      units: '50.0000',
      unit_price: '20.0000',
      total_amount: '1000.00',
      source_file: 'dime_report.pdf',
    },
  ]),
  updatePendingTransaction: vi.fn().mockResolvedValue({}),
  deletePendingTransaction: vi.fn().mockResolvedValue({}),
  batchDeletePending: vi.fn().mockResolvedValue({ count: 1 }),
  commitPendingTransactions: vi.fn().mockResolvedValue({ count: 1 }),
  createPendingTransaction: vi.fn().mockResolvedValue({}),
  getNavByDate: vi.fn().mockResolvedValue({ nav: 15.5 }),
  getNavDatesForMonth: vi.fn().mockResolvedValue({ nav_dates: {} }),
}));

describe('TransactionReviewModal Bank Filtering', () => {
  it('renders bank filter chips with counts', async () => {
    render(
      <I18nProvider>
        <TransactionReviewModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
      </I18nProvider>
    );

    // Should display bank filter bar
    expect(await screen.findByText('TMB-ES-SET50')).toBeInTheDocument();
    expect(screen.getByText('SCBS&P500FUND')).toBeInTheDocument();

    // Check bank pills
    expect(screen.getAllByText('ttb').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dime!').length).toBeGreaterThan(0);
  });

  it('filters by selected bank when clicking platform pill', async () => {
    render(
      <I18nProvider>
        <TransactionReviewModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
      </I18nProvider>
    );

    await screen.findByText('TMB-ES-SET50');

    // Click Dime! bank filter
    const dimeBtn = screen.getByRole('button', { name: /Dime!/i });
    fireEvent.click(dimeBtn);

    // TTB item should not be shown, Dime should remain
    expect(screen.queryByText('TMB-ES-SET50')).toBeNull();
    expect(screen.getByText('SCBS&P500FUND')).toBeInTheDocument();
  });

  it('supports initialPlatform prop', async () => {
    render(
      <I18nProvider>
        <TransactionReviewModal isOpen={true} initialPlatform="TTB" onClose={vi.fn()} onSuccess={vi.fn()} />
      </I18nProvider>
    );

    await screen.findByText('TMB-ES-SET50');
    // Only TTB shown
    expect(screen.getByText('TMB-ES-SET50')).toBeInTheDocument();
    expect(screen.queryByText('SCBS&P500FUND')).toBeNull();
  });
});
