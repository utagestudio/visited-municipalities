import { afterEach, describe, expect, it } from 'vitest';
import { setupAboutDialog } from './aboutDialog';

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
let cleanup = () => {};
afterEach(() => { cleanup();
  for (const [name, descriptor] of [['showModal', originalShow], ['close', originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  document.body.innerHTML = ''; });

function fixture() {
  document.body.innerHTML = '<div id="root"><a href="#about">このツールについて</a></div><section id="about"><h2 id="about-title">説明</h2><p>静的本文</p></section>';
}
function mockDialog() {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  } });
}

describe('static about modal', () => {
  it('preserves the same content node when React replaces the app and opens from a new link', () => {
    fixture(); mockDialog();
    const content = document.getElementById('about');
    cleanup = setupAboutDialog();
    document.getElementById('root')!.innerHTML = '<a href="#about">このツールについて</a>';
    const trigger = document.querySelector('a')!;
    trigger.focus(); trigger.click();
    const dialog = document.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.contains(content)).toBe(true);
    expect(document.getElementById('about')).toBe(content);
    dialog.querySelector('button')!.click();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    dialog.close(); // Native Escape handling closes the dialog through the same event.
    expect(document.activeElement).toBe(trigger);
  });

  it('leaves ordinary static text available when modal support is unavailable', () => {
    fixture();
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { value: undefined, configurable: true });
    cleanup = setupAboutDialog();
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.body.lastElementChild?.id).toBe('about');
    expect(document.getElementById('about')?.textContent).toContain('静的本文');
  });
});
