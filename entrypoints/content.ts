import type { ElementInfo, PageRequest, PageResponse, PageSnapshot } from '../src/protocol';
import { browser } from 'wxt/browser';
import { PagePointer } from '../src/page-pointer';

const selector = 'button, a[href], input, textarea, select, [role="button"], [role="link"], [contenteditable="true"], [role="textbox"], [role="menuitem"], [role="menuitemcheckbox"], [role="tab"], [role="combobox"]';
const ids = new WeakMap<Element, string>();
const elements = new Map<string, Element>();
let nextId = 1;
const pointer = new PagePointer();

function visible(element: Element): boolean {
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function label(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
  if (labelledBy) return labelledBy;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.labels?.[0]?.textContent?.trim() || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('name') || '';
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return element.getAttribute('aria-label') || element.getAttribute('data-placeholder')
      || element.getAttribute('placeholder') || element.getAttribute('name') || 'Message body';
  }
  return element.getAttribute('aria-label') || element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120) || '';
}

function snapshot(): PageSnapshot {
  elements.clear();
  const found: ElementInfo[] = [];
  for (const element of document.querySelectorAll(selector)) {
    if (!visible(element)) continue;
    let id = ids.get(element);
    if (!id) {
      id = `el_${nextId++}`;
      ids.set(element, id);
    }
    elements.set(id, element);
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'button' ? 'button' : element instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'file'].includes(element.type) || element instanceof HTMLTextAreaElement || element instanceof HTMLElement && element.isContentEditable ? 'textbox' : tag === 'select' ? 'combobox' : tag);
    const item: ElementInfo = { id, role, text: label(element), tag, focused: document.activeElement === element };
    if ((element instanceof HTMLInputElement && element.type !== 'password') || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      item.value = element.value;
    } else if (element instanceof HTMLElement && element.isContentEditable) {
      item.value = element.textContent || '';
    }
    if (element instanceof HTMLSelectElement) item.options = [...element.options].map(option => option.text.slice(0, 200)).slice(0, 50);
    found.push(item);
    if (found.length >= 150) break;
  }
  if (location.hostname === 'docs.google.com' && /^\/document\/d\//.test(location.pathname)
    && document.querySelector('.kix-appview-editor')) {
    elements.set('docs_body', document.querySelector('.kix-appview-editor')!);
    found.unshift({ id: 'docs_body', role: 'textbox', tag: 'editor', text: 'Google Docs document body' });
  }
  return { url: location.href, title: document.title, elements: found.slice(0, 150), draftRecipients: [...document.querySelectorAll('[email]')].map(element => element.getAttribute('email') || '').filter(Boolean).slice(0, 100) };
}

async function execute(request: PageRequest): Promise<PageResponse> {
  if (request.type === 'INSPECT') return { ok: true, snapshot: snapshot(), detail: 'Page inspected' };
  if (request.type === 'POINTER') {
    const hit = pointer.command(request.command)?.closest(selector);
    const page = snapshot();
    return { ok: true, snapshot: page, detail: request.command.kind === 'move' ? 'Webb pointer moving. Say stop to stop.' : 'Webb pointer ready.', pointerTarget: hit ? ids.get(hit) : undefined };
  }
  const element = elements.get(request.id);
  if (!element || !element.isConnected || !visible(element)) {
    return { ok: false, error: 'Element changed. Inspect the page again.' };
  }
  if (request.type === 'POINT_AT') { await pointer.pointAt(element); return { ok: true, snapshot: snapshot(), detail: 'Webb is pointing at the target.' }; }
  if (element.matches(':disabled, [aria-disabled="true"]') || request.type === 'FILL' && element.matches('[readonly], [aria-readonly="true"]')) {
    return { ok: false, error: 'This control is disabled or read-only. Choose an editable control.' };
  }
  if (!await pointer.pointAt(element)) return { ok: false, error: 'Action stopped before clicking.' };
  if (request.type === 'CLICK') {
    if (!(element instanceof HTMLElement)) return { ok: false, error: 'Element cannot be clicked.' };
    const actionText = [label(element), element.getAttribute('aria-label'), element.getAttribute('title')].filter(Boolean).join(' ');
    const risky = /\b(submit|deploy|publish|delete|remove|purchase|pay|checkout|send|revoke|confirm)\b/i.test(actionText);
    const submitsForm = element instanceof HTMLButtonElement && (element.type || 'submit') === 'submit' && !!element.closest('form');
    if ((risky || submitsForm || element instanceof HTMLInputElement && ['submit', 'reset'].includes(element.type)) && !request.confirmed) {
      return { ok: false, error: 'This action needs a dedicated user confirmation flow.' };
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || element.isContentEditable) element.focus();
    element.click();
    return { ok: true, snapshot: snapshot(), detail: `Clicked ${label(element) || request.id}` };
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    element.focus();
    const selection = window.getSelection();
    selection?.selectAllChildren(element);
    const inserted = document.execCommand('insertText', false, request.value);
    if (!inserted) {
      element.textContent = request.value;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: request.value }));
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    if (element.textContent !== request.value) return { ok: false, error: 'Editor rejected the value.' };
    return { ok: true, snapshot: snapshot(), detail: 'Editor value verified' };
  }
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
    return { ok: false, error: 'Element is not a field.' };
  }
  if (element instanceof HTMLInputElement && ['button', 'submit', 'reset', 'file', 'checkbox', 'radio'].includes(element.type)) {
    return { ok: false, error: 'This input cannot be filled as text.' };
  }
  if (element instanceof HTMLInputElement && element.type === 'password') {
    return { ok: false, error: 'Webb does not fill password fields.' };
  }
  element.focus();
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) return { ok: false, error: 'Field cannot be updated.' };
  let value = request.value;
  if (element instanceof HTMLSelectElement) {
    const option = [...element.options].find(item => item.value === value || item.text.trim().toLowerCase() === value.trim().toLowerCase());
    if (!option) return { ok: false, error: 'That option is not available. Choose one of the listed options.' };
    value = option.value;
  }
  setter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  if (element.value !== value) return { ok: false, error: 'Field rejected the value.' };
  return { ok: true, snapshot: snapshot(), detail: 'Field value verified' };
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main() {
    const scope = globalThis as typeof globalThis & { __webbContentReady?: boolean };
    if (scope.__webbContentReady) return;
    scope.__webbContentReady = true;
    browser.runtime.onMessage.addListener((message: PageRequest) => {
      if (!message || !['INSPECT', 'CLICK', 'FILL', 'POINT_AT', 'POINTER'].includes(message.type)) return;
      return execute(message).catch((error): PageResponse => ({ ok: false, error: error instanceof Error ? error.message : 'Page action failed' }));
    });

    let invite: HTMLElement | null = null;
    let promptTimer: number | undefined;
    const dismissalKey = `webb-video-dismissed:${location.pathname}${location.search}`;

    async function showVideoInvite() {
      if (invite || sessionStorage.getItem(dismissalKey)) return;
      const state = await browser.storage.local.get('webbActiveFollow');
      if (state.webbActiveFollow) return;
      invite = document.createElement('div');
      invite.setAttribute('data-webb-video-invite', '');
      const shadow = invite.attachShadow({ mode: 'closed' });
      shadow.innerHTML = `<style>
        :host{all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
        .card{width:min(310px,calc(100vw - 40px));padding:16px;border:1px solid #cdddc0;border-radius:16px;background:#f9fcf5;color:#213528;box-shadow:0 14px 42px rgba(12,28,17,.22)}
        .top{display:flex;align-items:center;justify-content:space-between;gap:10px}.brand{font-size:13px;font-weight:800;letter-spacing:-.03em}.dot{color:#286cf0}
        .close{border:0;background:transparent;color:#667566;font-size:19px;line-height:1;padding:2px 5px;cursor:pointer}
        p{margin:9px 0 13px;color:#526658;font-size:12px;line-height:1.45}
        .start{width:100%;min-height:38px;border:0;border-radius:9px;background:#286cf0;color:white;font-size:12px;font-weight:700;cursor:pointer}
        .start:hover{background:#1d59ca}.start:focus-visible,.close:focus-visible{outline:2px solid #286cf0;outline-offset:3px}
      </style><aside class="card" aria-label="Webb source invitation"><div class="top"><span class="brand">webb<span class="dot">.</span> · AUDIO SOURCE</span><button class="close" aria-label="Dismiss Webb invitation">×</button></div><p>Listen to this tab for instructions or capture notes in Webb.</p><button class="start">Open Webb</button></aside>`;
      shadow.querySelector<HTMLButtonElement>('.close')?.addEventListener('click', () => {
        sessionStorage.setItem(dismissalKey, '1');
        invite?.remove();
        invite = null;
      });
      shadow.querySelector<HTMLButtonElement>('.start')?.addEventListener('click', async event => {
        const button = event.currentTarget as HTMLButtonElement;
        button.disabled = true;
        button.textContent = 'Opening Webb...';
        try {
          const response = await browser.runtime.sendMessage({ type: 'VIDEO_FOLLOW_INTENT' }) as { ok?: boolean; error?: string };
          if (!response?.ok) throw new Error(response?.error || 'Open Webb from the toolbar.');
          invite?.remove();
          invite = null;
        } catch {
          button.textContent = 'Open Webb from the toolbar';
        }
      });
      document.documentElement.appendChild(invite);
    }

    function offerForVideo(video: HTMLVideoElement) {
      if (Number.isFinite(video.duration) && video.duration < 15) return;
      window.clearTimeout(promptTimer);
      promptTimer = window.setTimeout(() => {
        if (!video.paused && video.isConnected) void showVideoInvite();
      }, 1600);
    }
    document.addEventListener('play', event => {
      if (!(event.target instanceof HTMLVideoElement)) return;
      offerForVideo(event.target);
    }, true);
    document.querySelectorAll('video').forEach(video => {
      if (!video.paused) offerForVideo(video);
    });
  },
});
