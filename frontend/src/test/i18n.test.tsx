import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useI18n, I18nProvider, translations } from '../lib/i18n';

describe('i18n context and hook', () => {
  it('provides thai translation by default in I18nProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    );

    const { result } = renderHook(() => useI18n(), { wrapper });

    expect(result.current.locale).toBe('th');
    expect(result.current.t('appTitle')).toBe(translations.th.appTitle);
  });

  it('interpolates parameters correctly', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    );

    const { result } = renderHook(() => useI18n(), { wrapper });

    const interpolated = result.current.t('validCount', { n: 5 });
    expect(interpolated).toContain('5');
  });

  it('allows switching locale to en', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    );

    const { result } = renderHook(() => useI18n(), { wrapper });

    act(() => {
      result.current.setLocale('en');
    });

    expect(result.current.locale).toBe('en');
    expect(result.current.t('appTitle')).toBe('Fund Portfolio');
  });
});
