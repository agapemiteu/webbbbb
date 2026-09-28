import { browser } from 'wxt/browser';

const result = document.querySelector<HTMLElement>('#result')!;
async function check() {
  const documents = (await browser.tabs.query({})).filter(tab => {
    try { const url = new URL(tab.url || ''); return url.hostname === 'docs.google.com' && /^\/document\/d\//.test(url.pathname); }
    catch { return false; }
  });
  const active = documents.filter(tab => tab.active);
  const tab = active.length === 1 ? active[0] : documents.length === 1 ? documents[0] : undefined;
  const report: Record<string, unknown> = { version: browser.runtime.getManifest().version, debuggerPermission: await browser.permissions.contains({ permissions: ['debugger'] }), documents: documents.length };
  if (!tab?.id) report.error = 'No unique Google Docs target. Activate the test document and run the check again.';
  else {
    const target = { tabId: tab.id };
    const structure = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({
      editor: !!document.querySelector('.kix-appview-editor'),
      textFrame: !!document.querySelector('.docs-texteventtarget-iframe'),
      extensionFrames: [...document.querySelectorAll('iframe')].filter(frame => frame.src.startsWith('chrome-extension://')).length,
      frameSchemes: [...document.querySelectorAll('iframe')].map(frame => { try { return new URL(frame.src).protocol; } catch { return 'empty'; } }),
    }) });
    report.structure = structure[0]?.result;
    const targets = await browser.debugger.getTargets();
    report.extensionFrameTargets = targets.filter(item => ['iframe', 'other'].includes(item.type) && item.url.startsWith('chrome-extension://')).map(item => new URL(item.url).hostname);
    const pageTarget = targets.find(item => item.tabId === tab.id && item.type === 'page');
    if (pageTarget) {
      try { await browser.debugger.attach({ targetId: pageTarget.id }, '1.3'); report.targetIdAttached = true; await browser.debugger.detach({ targetId: pageTarget.id }); }
      catch (error) { report.targetIdError = error instanceof Error ? error.message : String(error); }
    }
    try {
      await browser.debugger.attach(target, '1.3');
      report.attached = true;
      await browser.debugger.detach(target);
    } catch (error) { report.error = error instanceof Error ? error.message : String(error); }
  }
  result.textContent = JSON.stringify(report, null, 2);
  // Development diagnostics only. No document text, title, URL, or browser history is reported.
  if (new URL(location.href).searchParams.get('local') === '1') {
    const sent = await fetch('http://127.0.0.1:9341/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }).catch(() => null);
    if (sent?.ok) {
      const checks = (await browser.tabs.query({})).filter(tab => tab.url?.startsWith(browser.runtime.getURL('/browser-check.html')) && tab.id);
      await browser.tabs.remove(checks.map(tab => tab.id!));
    }
  }
}
void check().catch(error => { result.textContent = String(error); });
