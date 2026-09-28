import { browser } from 'wxt/browser';

export async function attachBrowserInput(tabId: number): Promise<void> {
  if (!await browser.permissions.contains({ permissions: ['debugger'] })) {
    throw new Error('Browser input permission is missing. Reload Webb in chrome://extensions and accept its updated permissions. No keyboard input was sent.');
  }
  try { await browser.debugger.attach({ tabId }, '1.3'); }
  catch (error) {
    const detail = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const recovery = /another debugger|already attached/i.test(detail)
      ? 'Close DevTools or disconnect the other browser automation tool from this tab.'
      : /chrome-extension:\/\/|different extension/i.test(detail)
        ? 'Chrome reports a conflict with another extension. Try this page in a Chrome profile with only Webb enabled.'
        : /canceled|cancelled|denied by user/i.test(detail)
          ? 'Chrome cancelled browser input. Approve the browser notice when retrying.'
          : /policy|administrator/i.test(detail)
            ? 'This Chrome profile has a policy blocking browser input.'
            : 'Browser input was blocked. Share this Chrome error so we can identify the restriction.';
    throw new Error(`${recovery} No keyboard input was sent. Chrome: ${detail}`);
  }
}

// Fixed browser inputs only. The planner cannot choose protocol methods or code.
export async function appendToGoogleDoc(tabId: number, text: string): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  const url = new URL(tab.url || '');
  if (url.hostname !== 'docs.google.com' || !/^\/document\/d\//.test(url.pathname)) {
    throw new Error('Choose an open Google Docs document.');
  }
  if (!text.trim() || text.length > 4000) throw new Error('Document text must be between 1 and 4,000 characters.');
  const target = { tabId };
  let inserted = false;
  await attachBrowserInput(tabId);
  try {
    const readText = async () => {
      const dom = await browser.scripting.executeScript({ target: { tabId }, func: () => {
        const editor = document.querySelector('.kix-appview-editor');
        return [...(editor?.querySelectorAll('[aria-label], .kix-lineview-text-block') || [])]
          .map(element => element.getAttribute('aria-label') || element.textContent || '').join(' ');
      } });
      const tree = await browser.debugger.sendCommand(target, 'Accessibility.getFullAXTree') as {
        nodes?: { role?: { value?: string }; name?: { value?: string }; value?: { value?: string } }[];
      } | undefined;
      return `${dom[0]?.result || ''} ${(tree?.nodes || []).filter(node => node.role?.value === 'textbox' && /document (body|content)|text editor/i.test(node.name?.value || '')).map(node => `${node.name?.value || ''} ${node.value?.value || ''}`).join(' ')}`.replace(/\s+/g, ' ');
    };
    const expected = text.replace(/\s+/g, ' ').trim();
    const before = await readText();
    const occurrences = (value: string) => value.split(expected).length - 1;
    const results = await browser.scripting.executeScript({ target: { tabId }, func: () => {
      const editor = document.querySelector<HTMLElement>('.kix-appview-editor');
      if (!editor) return null;
      const box = editor.getBoundingClientRect();
      return { x: box.left + Math.min(180, box.width / 2), y: box.top + Math.min(100, box.height / 2) };
    } });
    const point = results[0]?.result;
    if (!point) throw new Error('The document editor is not ready. Open an editable document first.');
    await browser.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await browser.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    // Append at the end, never replace an existing document.
    await browser.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35, modifiers: 2 });
    await browser.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35, modifiers: 2 });
    await browser.debugger.sendCommand(target, 'Input.insertText', { text: `\n${text}` });
    inserted = true;
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      const observed = await readText();
      if (occurrences(observed) > occurrences(before)) return;
    }
    throw new Error('Text input was attempted, but Webb could not verify it in Docs. Check the document before asking again.');
  } catch (error) {
    if (inserted && !(error instanceof Error && error.message.includes('Check the document'))) {
      throw new Error('Document input may have succeeded. Check the document before asking again.');
    }
    throw error;
  } finally {
    await browser.debugger.detach(target).catch(() => {});
  }
}
