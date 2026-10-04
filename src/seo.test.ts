import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, 'utf8');

describe('static SEO content and delivery', () => {
  it('includes an initial overview without content below the tool', () => {
    const document = new DOMParser().parseFromString(read('index.html'), 'text/html');
    expect(document.querySelector('#root')?.textContent).toContain('市区町村を色分け');
    expect(document.querySelector('#root a')?.getAttribute('href')).toBe('/about.html');
    expect(document.querySelectorAll('body > section, body > main')).toHaveLength(0);
  });

  it('provides a separate static usage page with a return link', () => {
    const document = new DOMParser().parseFromString(read('public/about.html'), 'text/html');
    expect(document.querySelector('main')?.textContent).toContain('ブラウザに自動保存');
    expect(document.querySelector('main')?.textContent).toContain('閲覧専用');
    expect(document.querySelector('a')?.getAttribute('href')).toBe('/');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://visited-municipalities.utage.games/about');
    expect(document.querySelector('script')).toBeNull();
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
