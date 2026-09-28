import { browser } from 'wxt/browser';

export async function commitGmailRecipient(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  if (new URL(tab.url || '').hostname !== 'mail.google.com') throw new Error('Recipient input requires the selected Gmail tab.');
  const target = { tabId };
  await browser.debugger.attach(target, '1.3').catch(() => {
    throw new Error('Chrome could not commit the recipient. Close DevTools on Gmail and try again.');
  });
  try {
    await browser.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await browser.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  } finally {
    await browser.debugger.detach(target).catch(() => {});
  }
}
