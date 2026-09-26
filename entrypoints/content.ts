import type { ElementInfo, PageRequest, PageResponse, PageSnapshot } from '../src/protocol';
import { browser } from 'wxt/browser';

const selector = 'button, a[href], input, textarea, select, [role="button"], [role="link"]';
const ids = new WeakMap<Element, string>();
const elements = new Map<string, Element>();
let nextId = 1;

function visible(element: Element): boolean {
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function label(element: Element): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.labels?.[0]?.textContent?.trim() || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('name') || '';
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
    const role = element.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'button' ? 'button' : tag);
    const item: ElementInfo = { id, role, text: label(element), tag };
    if ((element instanceof HTMLInputElement && element.type !== 'password') || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      item.value = element.value;
    }
    found.push(item);
    if (found.length >= 150) break;
  }
  return { url: location.href, title: document.title, elements: found };
}

async function execute(request: PageRequest): Promise<PageResponse> {
  if (request.type === 'INSPECT') return { ok: true, snapshot: snapshot(), detail: 'Page inspected' };
  const element = elements.get(request.id);
  if (!element || !element.isConnected || !visible(element)) {
    return { ok: false, error: 'Element changed. Inspect the page again.' };
  }
  if (request.type === 'CLICK') {
    if (!(element instanceof HTMLElement)) return { ok: false, error: 'Element cannot be clicked.' };
    const actionText = [label(element), element.getAttribute('aria-label'), element.getAttribute('title')].filter(Boolean).join(' ');
    const risky = /\b(submit|deploy|publish|delete|remove|purchase|pay|checkout|send|revoke|confirm)\b/i.test(actionText);
    const submitsForm = element instanceof HTMLButtonElement && (element.type || 'submit') === 'submit' && !!element.closest('form');
    if ((risky || submitsForm || element instanceof HTMLInputElement && ['submit', 'reset'].includes(element.type)) && !request.confirmed) {
      return { ok: false, error: 'This action needs a dedicated user confirmation flow.' };
    }
    element.click();
    return { ok: true, snapshot: snapshot(), detail: `Clicked ${label(element) || request.id}` };
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
  setter.call(element, request.value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  if (element.value !== request.value) return { ok: false, error: 'Field rejected the value.' };
  return { ok: true, snapshot: snapshot(), detail: 'Field value verified' };
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main() {
    browser.runtime.onMessage.addListener((message: PageRequest) => {
      return execute(message).catch((error): PageResponse => ({ ok: false, error: error instanceof Error ? error.message : 'Page action failed' }));
    });
  },
});
