import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoadingScreen } from './LoadingScreen';

const html = readFileSync(`${process.cwd()}/index.html`, 'utf8');

function normalizedMarkup(element: Element) {
  return element.outerHTML.replace(/>\s+</g, '><').trim();
}

describe('startup screen', () => {
  it('uses the same screen before and after React starts', () => {
    const initial = new DOMParser().parseFromString(html, 'text/html');
    const rendered = new DOMParser().parseFromString(renderToStaticMarkup(<LoadingScreen />), 'text/html');
    expect(normalizedMarkup(initial.querySelector('.startupShell')!)).toBe(
      normalizedMarkup(rendered.querySelector('.startupShell')!),
    );
  });

  it('enables the loader before body parsing without removing static content', () => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const script = document.querySelector('head script:not([type])')!;
    expect(script.textContent).toContain("setAttribute('data-startup'");
    expect(script.textContent).toContain("setAttribute('data-about-modal'");
    expect(document.querySelector('style')?.textContent).toContain('html[data-about-modal] body > #about');
    expect(document.querySelector('#about')?.textContent).toContain('ブラウザに自動保存');
    expect(document.documentElement.hasAttribute('data-about-modal')).toBe(false);
  });
});
