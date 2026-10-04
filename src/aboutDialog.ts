/** Enhance existing static content without handing it over to React. */
export function setupAboutDialog(): () => void {
  const content = document.getElementById('about');
  if (!content || typeof HTMLDialogElement === 'undefined' ||
      typeof HTMLDialogElement.prototype.showModal !== 'function') return () => {};

  const dialog = document.createElement('dialog');
  dialog.className = 'aboutDialog';
  dialog.setAttribute('aria-labelledby', 'about-title');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ghostButton aboutClose';
  closeButton.textContent = '閉じる';
  const originalParent = content.parentNode!;
  const originalNext = content.nextSibling;
  dialog.append(closeButton, content);
  document.body.append(dialog);
  let trigger: HTMLElement | null = null;

  function onClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href="#about"]') : null;
    if (!(link instanceof HTMLElement)) return;
    event.preventDefault();
    trigger = link;
    if (!dialog.open) dialog.showModal();
  }
  function onClose() { trigger?.focus(); }
  function close() { dialog.close(); }
  document.addEventListener('click', onClick);
  dialog.addEventListener('close', onClose);
  closeButton.addEventListener('click', close);

  return () => {
    if (dialog.open) dialog.close();
    document.removeEventListener('click', onClick);
    dialog.removeEventListener('close', onClose);
    originalParent.insertBefore(content, originalNext);
    dialog.remove();
  };
}
