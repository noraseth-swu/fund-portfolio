import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsModal } from '../components/SettingsModal';
import { I18nProvider } from '../lib/i18n';

// Mock api
vi.mock('../lib/api', () => ({
  getUserSettings: vi.fn().mockResolvedValue({
    user_id: 'test_user',
    gmail_account: 'test@gmail.com',
    dob_day: '01',
    dob_month: '02',
    dob_year_ce: '1980',
    dob_year_be: '2523',
    national_id_last5: '12345',
    auto_sync_enabled: true,
  }),
  updateUserSettings: vi.fn().mockResolvedValue({}),
  testEmailConnection: vi.fn().mockResolvedValue({ success: true, inbox_messages: 42 }),
  syncEmailStatements: vi.fn().mockResolvedValue({
    success: true,
    emails_scanned: 10,
    attachments_found: 5,
    transactions_extracted: 5,
    transactions_inserted: 5,
    transactions_skipped: 0,
    details: [],
  }),
  getEmailBrokerConfigs: vi.fn().mockResolvedValue([
    {
      key: 'TTB',
      name: 'ttb smart port',
      enabled: true,
      sender_emails: ['estatement@eservice.ttbbank.com'],
      subject_includes: ['confirmation note'],
      subject_excludes: [],
      extraction_type: 'PDF_ATTACHMENT',
      password_patterns: ['{DD}{MMM_EN}{YYYY_CE}'],
      ai_prompt_variant: 'MUTUAL_FUND_THAI',
    },
  ]),
  updateEmailBrokerConfigs: vi.fn().mockResolvedValue([]),
  resetEmailBrokerConfigs: vi.fn().mockResolvedValue([]),
}));

describe('SettingsModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <I18nProvider>
        <SettingsModal isOpen={false} onClose={vi.fn()} />
      </I18nProvider>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal header and preview cards when open', async () => {
    render(
      <I18nProvider>
        <SettingsModal isOpen={true} onClose={vi.fn()} />
      </I18nProvider>
    );

    expect(screen.getByText(/ตั้งค่าระบบ & Gmail Auto-Sync|System Settings/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/ttb Smart Port/i)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Dime!/i)).toBeInTheDocument();
    expect(screen.getByText(/SCB EASY/i)).toBeInTheDocument();
    expect(screen.getByText(/KASSET PVD/i)).toBeInTheDocument();
  });

  it('renders localized English text when locale is en', async () => {
    localStorage.setItem('fund_portfolio_locale', 'en');
    render(
      <I18nProvider>
        <SettingsModal isOpen={true} onClose={vi.fn()} />
      </I18nProvider>
    );

    expect(screen.getByText(/System Settings/i)).toBeInTheDocument();
    expect(await screen.findByText(/Historical NAV Backfill/i)).toBeInTheDocument();
    expect(await screen.findByText(/Master Broker Rules/i)).toBeInTheDocument();
    localStorage.removeItem('fund_portfolio_locale');
  });
});
