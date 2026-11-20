import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { translations, I18nProvider, useI18n, type TranslationKey } from '../lib/i18n';
import { PasswordPromptCard } from '../components/import/PasswordPromptCard';
import { MetricCard } from '../components/MetricCard';
import { PlatformBadge } from '../components/PlatformBadge';

describe('i18n completeness and consistency suite', () => {
  const thKeys = Object.keys(translations.th) as TranslationKey[];
  const enKeys = Object.keys(translations.en) as (keyof typeof translations.en)[];
  const thaiCharRegex = /[\u0E00-\u0E7F]/;

  it('has identical keys in Thai and English dictionaries (key symmetry)', () => {
    const missingInEn = thKeys.filter((k) => !(k in translations.en));
    const missingInTh = enKeys.filter((k) => !(k in translations.th));

    expect(missingInEn, `Keys present in TH but missing in EN: ${missingInEn.join(', ')}`).toEqual([]);
    expect(missingInTh, `Keys present in EN but missing in TH: ${missingInTh.join(', ')}`).toEqual([]);
  });

  it('ensures no empty or whitespace-only translation strings exist', () => {
    for (const key of thKeys) {
      const thVal = translations.th[key];
      expect(typeof thVal).toBe('string');
      expect(thVal.trim().length, `Key '${key}' in TH has empty translation`).toBeGreaterThan(0);

      const enVal = (translations.en as Record<string, string>)[key];
      expect(typeof enVal).toBe('string');
      expect(enVal.trim().length, `Key '${key}' in EN has empty translation`).toBeGreaterThan(0);
    }
  });

  it('ensures zero Thai unicode characters in the English dictionary values', () => {
    const contaminatedEnKeys: { key: string; val: string }[] = [];

    for (const key of enKeys) {
      const enVal = (translations.en as Record<string, string>)[key];
      if (thaiCharRegex.test(enVal)) {
        contaminatedEnKeys.push({ key, val: enVal });
      }
    }

    expect(
      contaminatedEnKeys,
      `English dictionary contains Thai unicode characters in keys: ${JSON.stringify(contaminatedEnKeys, null, 2)}`
    ).toEqual([]);
  });

  it('ensures parameter placeholders ({param}) match between TH and EN', () => {
    const paramRegex = /\{([a-zA-Z0-9_]+)\}/g;

    const extractParams = (str: string): string[] => {
      const matches = str.match(paramRegex) || [];
      return matches.sort();
    };

    const mismatchedParams: string[] = [];

    for (const key of thKeys) {
      const thVal = translations.th[key];
      const enVal = (translations.en as Record<string, string>)[key];
      if (!enVal) continue;

      const thParams = extractParams(thVal);
      const enParams = extractParams(enVal);

      if (thParams.join(',') !== enParams.join(',')) {
        mismatchedParams.push(
          `Key '${key}': TH params [${thParams.join(', ')}] vs EN params [${enParams.join(', ')}]`
        );
      }
    }

    expect(mismatchedParams, `Placeholder mismatch detected:\n${mismatchedParams.join('\n')}`).toEqual([]);
  });

  it('renders localized strings properly when switching between EN and TH', () => {
    const TestComponent = () => {
      const { locale, setLocale, t } = useI18n();
      return (
        <div>
          <span data-testid="app-title">{t('appTitle')}</span>
          <span data-testid="current-locale">{locale}</span>
          <button data-testid="switch-en" onClick={() => setLocale('en')}>
            Switch EN
          </button>
          <button data-testid="switch-th" onClick={() => setLocale('th')}>
            Switch TH
          </button>
        </div>
      );
    };

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );

    // Initial state: default is TH
    const titleEl = screen.getByTestId('app-title');
    expect(titleEl.textContent).toBe(translations.th.appTitle);

    // Switch to EN
    act(() => {
      screen.getByTestId('switch-en').click();
    });
    expect(screen.getByTestId('current-locale').textContent).toBe('en');
    expect(titleEl.textContent).toBe(translations.en.appTitle);

    // Switch back to TH
    act(() => {
      screen.getByTestId('switch-th').click();
    });
    expect(screen.getByTestId('current-locale').textContent).toBe('th');
    expect(titleEl.textContent).toBe(translations.th.appTitle);
  });

  it('renders MetricCard component in localized context without crashing', () => {
    const { unmount } = render(
      <I18nProvider>
        <MetricCard
          title="Total Value"
          value="100,000.00"
          subValue="+5.2%"
          trend="positive"
        />
      </I18nProvider>
    );
    expect(screen.getByText('Total Value')).toBeInTheDocument();
    expect(screen.getByText('100,000.00')).toBeInTheDocument();
    unmount();
  });

  it('renders PlatformBadge with valid badges', () => {
    const { unmount } = render(
      <I18nProvider>
        <PlatformBadge platform="KBank" />
      </I18nProvider>
    );
    expect(screen.getByText('KBank')).toBeInTheDocument();
    unmount();
  });

  it('renders PasswordPromptCard and verifies localized string rendering in both EN and TH', () => {
    const TestContainer = () => {
      const { setLocale } = useI18n();
      return (
        <div>
          <button data-testid="set-en" onClick={() => setLocale('en')}>EN</button>
          <button data-testid="set-th" onClick={() => setLocale('th')}>TH</button>
          <PasswordPromptCard
            pdfPassword=""
            onPasswordChange={() => {}}
            onSubmit={() => {}}
            loading={false}
          />
        </div>
      );
    };

    const { unmount } = render(
      <I18nProvider>
        <TestContainer />
      </I18nProvider>
    );

    // Default TH: verify Thai header
    expect(screen.getByText(translations.th.pdfPasswordRequired)).toBeInTheDocument();
    expect(screen.getByText(translations.th.unlockAndScan)).toBeInTheDocument();

    // Switch to EN: verify English header rendered without any Thai characters
    act(() => {
      screen.getByTestId('set-en').click();
    });
    const enTitle = screen.getByText(translations.en.pdfPasswordRequired);
    expect(enTitle).toBeInTheDocument();
    expect(thaiCharRegex.test(enTitle.textContent || '')).toBe(false);

    const enButton = screen.getByText(translations.en.unlockAndScan);
    expect(enButton).toBeInTheDocument();
    expect(thaiCharRegex.test(enButton.textContent || '')).toBe(false);

    unmount();
  });

  it('contains all required SettingsModal and NAV backfill keys in both th and en', () => {
    const requiredKeys: (keyof typeof translations.th)[] = [
      'navBackfillTitle',
      'backfillRunning',
      'backfillPausedStatus',
      'pauseBackfill',
      'resumeBackfill',
      'backfillProgress',
      'backfillResumed',
      'backfillPaused',
      'masterBrokerRulesTitle',
      'resetToDefaults',
      'senderEmailsLabel',
      'passwordPatternsLabel',
      'emailsScanned',
      'attachmentsFound',
      'importedSuccess',
      'skippedDuplicates',
      'shareClasses',
      'switchClass',
    ];

    for (const k of requiredKeys) {
      expect(translations.th[k], `Missing TH key: ${k}`).toBeDefined();
      expect(translations.en[k], `Missing EN key: ${k}`).toBeDefined();
      expect(translations.en[k].length).toBeGreaterThan(0);
    }
  });
});
