import { useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';

const THEME_KEY = 'fund_portfolio_theme';

export function getInitialTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
  if (saved === 'light' || saved === 'dark' || saved === 'auto') {
    return saved;
  }
  return 'dark'; // Default dark theme for financial terminal
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  localStorage.setItem(THEME_KEY, mode);

  let isDark = false;
  if (mode === 'auto') {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } else {
    isDark = mode === 'dark';
  }

  if (isDark) {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);

    if (theme === 'auto') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme('auto');
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [theme]);

  const changeTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  return { theme, setTheme: changeTheme };
}
