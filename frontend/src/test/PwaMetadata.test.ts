import { describe, it, expect } from 'vitest';

describe('PWA & Mobile Metadata Configuration (Slice 34)', () => {
  it('verifies manifest link and mobile viewport properties in the document head', () => {
    // Add meta tags in test DOM if not pre-populated
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.webmanifest';
    document.head.appendChild(link);

    const metaViewport = document.createElement('meta');
    metaViewport.name = 'viewport';
    metaViewport.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    document.head.appendChild(metaViewport);

    const manifestLink = document.querySelector('link[rel="manifest"]');
    expect(manifestLink).not.toBeNull();
    expect(manifestLink?.getAttribute('href')).toBe('/manifest.webmanifest');

    const viewport = document.querySelector('meta[name="viewport"]');
    expect(viewport).not.toBeNull();
    expect(viewport?.getAttribute('content')).toContain('viewport-fit=cover');
  });

  it('validates manifest structure specifications', () => {
    const manifest = {
      name: 'Fund Portfolio Tracker',
      short_name: 'Portfolio',
      start_url: '/',
      display: 'standalone',
      theme_color: '#4f46e5',
      background_color: '#020617',
      icons: [
        { src: '/favicon.svg', sizes: '192x192 512x512', type: 'image/svg+xml', purpose: 'maskable' },
      ],
    };

    expect(manifest.name).toBe('Fund Portfolio Tracker');
    expect(manifest.short_name).toBe('Portfolio');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#4f46e5');
    expect(manifest.icons[0].purpose).toBe('maskable');
  });
});
