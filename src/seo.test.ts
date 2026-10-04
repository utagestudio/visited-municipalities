import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, 'utf8');

describe('static SEO content and delivery', () => {
  it('keeps complete static content outside the React root', () => {
    const document = new DOMParser().parseFromString(read('index.html'), 'text/html');
    const about = document.querySelector('#about');
    expect(about).not.toBeNull();
    expect(document.querySelector('#root')?.contains(about)).toBe(false);
    expect(about?.textContent).toContain('ブラウザに自動保存');
    expect(about?.textContent).toContain('閲覧専用');
    expect(about?.hasAttribute('hidden')).toBe(false);
    expect(about?.querySelector('#about-title')).not.toBeNull();
    expect(existsSync(`${process.cwd()}/public/about.html`)).toBe(false);
  });

  it('allows rendering resources to be crawled while keeping data out of search', () => {
    expect(read('public/robots.txt')).not.toMatch(/^Disallow:\s*\/data\//m);
    expect(read('public/_headers')).toMatch(/\/data\/\*\s+X-Robots-Tag: noindex/);
  });

  it('provides a standalone not-found page without a catch-all rewrite', () => {
    const document = new DOMParser().parseFromString(read('public/404.html'), 'text/html');
    expect(document.querySelector('a')?.getAttribute('href')).toBe('/');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(document.querySelector('script')).toBeNull();
    expect(existsSync(`${process.cwd()}/public/_redirects`)).toBe(false);
  });
});
