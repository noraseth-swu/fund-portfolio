import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransactionReviewModal } from '../components/TransactionReviewModal';
import { I18nProvider } from '../lib/i18n';
import * as api from '../lib/api';

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
    {
      id: 'pt_3',
      platform: 'SCB',
      raw_fund_name: 'SCBS&P500',
      proj_id: 'M0643_2555',
      fund_abbr: 'SCBS&P500E',
      match_confidence: 'EXACT',
      trans_type: 'BUY',
      trans_date: '2026-03-01',
      units: '223.6081',
      unit_price: '44.7211',
      total_amount: '10000.00',
      source_file: 'scb_statement.pdf',
      candidate_classes: ['SCBS&P500E', 'SCBS&P500(SSFA)'],
    },
  ]),
  updatePendingTransaction: vi.fn().mockResolvedValue({}),
  deletePendingTransaction: vi.fn().mockResolvedValue({}),
  batchDeletePending: vi.fn().mockResolvedValue({ count: 1 }),
  commitPendingTransactions: vi.fn().mockResolvedValue({ count: 1 }),
  createPendingTransaction: vi.fn().mockResolvedValue({}),
  getNavByDate: vi.fn().mockImplementation((_projId: string, _date: string, fundAbbr?: string) => {
    if (fundAbbr === 'SCBS&P500(SSFA)') {
      return Promise.resolve({ nav: '44.4444', nav_date: '2026-03-01', nav_source: 'SEC_HISTORY', is_exact_date: true });
    }
    if (fundAbbr === 'SCBS&P500E') {
      return Promise.resolve({ nav: '44.7211', nav_date: '2026-03-01', nav_source: 'SEC_HISTORY', is_exact_date: true });
    }
    return Promise.resolve({ nav: '15.5000', nav_date: '2026-03-01', nav_source: 'SEC_LATEST', is_exact_date: true });
  }),
  getNavDatesForMonth: vi.fn().mockResolvedValue({ nav_dates: {} }),
  searchFunds: vi.fn().mockResolvedValue([
    { proj_id: 'M0643_2555', proj_abbr_name: 'SCBS&P500E', last_nav: '44.7211' },
    { proj_id: 'M0643_2555', proj_abbr_name: 'SCBS&P500(SSFA)', last_nav: '44.4444' },
  ]),
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

describe('Task 36.5: Interactive Multi-Class Selector in Staged Review', () => {
  it('displays candidate share class pills with NAV on transaction date when multiple classes exist', async () => {
    render(
      <I18nProvider>
        <TransactionReviewModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
      </I18nProvider>
    );

    // Wait for staged items to load
    await screen.findByText('TMB-ES-SET50');

    // pt_3 has candidate classes: SCBS&P500E and SCBS&P500(SSFA)
    const selector = await screen.findByTestId('share-class-selector-pt_3');
    expect(selector).toBeInTheDocument();

    // Verify candidate class pills are rendered
    const pillE = screen.getByTestId('share-class-pill-SCBS&P500E');
    const pillSSFA = screen.getByTestId('share-class-pill-SCBS&P500(SSFA)');

    expect(pillE).toBeInTheDocument();
    expect(pillSSFA).toBeInTheDocument();

    // Verify initial active state (SCBS&P500E is selected)
    expect(pillE.getAttribute('aria-pressed')).toBe('true');
    expect(pillSSFA.getAttribute('aria-pressed')).toBe('false');

    // Verify NAV on transaction date is displayed
    expect(pillE.textContent).toContain('44.7211');
    expect(await screen.findByText(/44.4444/)).toBeInTheDocument();
  });

  it('allows user to switch share class with one click and updates transaction state and persists', async () => {
    const updateSpy = vi.spyOn(api, 'updatePendingTransaction');

    render(
      <I18nProvider>
        <TransactionReviewModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
      </I18nProvider>
    );

    // Wait for selector to appear
    const pillSSFA = await screen.findByTestId('share-class-pill-SCBS&P500(SSFA)');
    const pillE = screen.getByTestId('share-class-pill-SCBS&P500E');

    expect(pillE.getAttribute('aria-pressed')).toBe('true');
    expect(pillSSFA.getAttribute('aria-pressed')).toBe('false');

    // One-click switch to SCBS&P500(SSFA)
    fireEvent.click(pillSSFA);

    // Verify local state immediately updated: pillSSFA is now active
    await waitFor(() => {
      expect(pillSSFA.getAttribute('aria-pressed')).toBe('true');
      expect(pillE.getAttribute('aria-pressed')).toBe('false');
    });

    // Verify backend update was called with the switched class, new NAV, and recalculated units
    expect(updateSpy).toHaveBeenCalledWith('pt_3', expect.objectContaining({
      fund_abbr: 'SCBS&P500(SSFA)',
      unit_price: '44.4444',
      total_amount: '10000.00',
    }));
  });

  it('does not display share class selector for single-class funds', async () => {
    render(
      <I18nProvider>
        <TransactionReviewModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
      </I18nProvider>
    );

    await screen.findByText('TMB-ES-SET50');

    // pt_1 (TMB-ES-SET50) has only 1 class, so no selector should be rendered
    expect(screen.queryByTestId('share-class-selector-pt_1')).toBeNull();
  });
});
