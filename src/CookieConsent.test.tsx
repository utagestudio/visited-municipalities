import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COOKIE_CONSENT_KEY, CookieConsent } from './CookieConsent';

const scripts = () => document.querySelectorAll('script[src*="googletagmanager.com"]');
const renderConsent = (gtmId = 'GTM-TEST123') => render(
  <StrictMode><CookieConsent gtmId={gtmId} /></StrictMode>,
);

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  });
});

afterEach(() => {
  cleanup();
  scripts().forEach((script) => script.remove());
  delete (window as Window & { dataLayer?: unknown[] }).dataLayer;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Cookie consent', () => {
  it.each(['', '   '])('does nothing without a container ID (%j), even with saved approval', (id) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    renderConsent(id);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(scripts()).toHaveLength(0);
  });

  it('waits for approval and loads the specified container only once across remounts', () => {
    const view = renderConsent();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(scripts()).toHaveLength(0);
    expect(document.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '承認する' }));
    expect(localStorage.getItem(COOKIE_CONSENT_KEY)).toBe('accepted');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]).toHaveAttribute('src', 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST123');
    view.rerender(<StrictMode><CookieConsent gtmId="GTM-TEST123" /></StrictMode>);
    view.unmount();
    renderConsent();
    expect(scripts()).toHaveLength(1);
    expect((window as Window & { dataLayer?: unknown[] }).dataLayer).toHaveLength(1);
  });

  it('persists rejection and restores it without loading GTM', () => {
    const view = renderConsent();
    fireEvent.click(screen.getByRole('button', { name: '拒否する' }));
    expect(localStorage.getItem(COOKIE_CONSENT_KEY)).toBe('rejected');
    view.unmount();
    renderConsent();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(scripts()).toHaveLength(0);
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('restores approval on a fresh page', () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    renderConsent();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(scripts()).toHaveLength(1);
  });

  it.each(['garbage', '{broken', 'true'])('treats invalid stored consent %j as undecided', (saved) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, saved);
    renderConsent();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(scripts()).toHaveLength(0);
  });

  it('honors the current choice when browser storage is unavailable', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    renderConsent();
    fireEvent.click(screen.getByRole('button', { name: '承認する' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(scripts()).toHaveLength(1);
  });
});
