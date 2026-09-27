const port = Number(process.env.WEBB_CDP_PORT || 9225);
const base = `http://127.0.0.1:${port}`;

class DevTools {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.events = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.method) this.events.push(message);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    };
  }

  static async connect(target) {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    return new DevTools(socket);
  }

  command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this.command('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text || 'Browser evaluation failed');
    return result.value;
  }

  close() { this.socket.close(); }
}

async function targets() {
  return fetch(`${base}/json/list`).then(response => response.json());
}

async function openPage(url) {
  const response = await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Chrome could not open ${url}: ${response.status}`);
  return DevTools.connect(await response.json());
}

async function waitFor(client, expression, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await client.evaluate(expression).catch(() => null);
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const existingPanel = (await targets()).find(target => target.type === 'page'
  && target.title === 'Webb' && target.url.startsWith('chrome-extension://'));
const extensionId = process.env.WEBB_EXTENSION_ID || (existingPanel && new URL(existingPanel.url).hostname);
if (!extensionId) throw new Error('Open Webb sidepanel.html in the isolated Chromium profile first.');
console.log(`Webb extension loaded: ${extensionId}`);

const runId = `webbqa${Date.now()}`;
const site = await openPage(`https://webb-five-puce.vercel.app/demo/?qa=${runId}`);
await waitFor(site, 'document.readyState === "complete" && document.title.includes("Acme")', 'practice site');
console.log(`Practice site loaded: ${await site.evaluate('document.title')}`);

const panel = await openPage(`chrome-extension://${extensionId}/sidepanel.html`);
await waitFor(panel, 'Boolean(document.querySelector(".consent-button, #target-tab"))', 'Webb panel');
console.log(`Panel loaded: ${await panel.evaluate('document.title')}`);

console.log(`Extension runtime: ${await panel.evaluate('chrome.runtime.id')}`);
if (process.env.WEBB_PROBE_TOKEN === '1') {
  await panel.command('Network.enable');
  const status = await panel.evaluate(`(async () => {
    const response = await fetch('https://webb-api.collins-coordinator-worker.workers.dev/assemblyai-token', {
      headers: { 'X-Webb-Extension': chrome.runtime.id },
    });
    return { status: response.status, body: response.ok ? '<token omitted>' : await response.text(), origin: location.origin };
  })()`);
  console.log(`Browser token probe: ${JSON.stringify(status)}`);
  console.log(`Request origins: ${JSON.stringify(panel.events.filter(event => event.method === 'Network.requestWillBeSentExtraInfo').map(event => ({ origin: event.params.headers.origin || null, site: event.params.headers['sec-fetch-site'] || null, mode: event.params.headers['sec-fetch-mode'] || null })))}`);
  console.log(`Request header names: ${JSON.stringify(panel.events.filter(event => event.method === 'Network.requestWillBeSentExtraInfo').map(event => Object.keys(event.params.headers)))}`);
  panel.close();
  site.close();
  process.exit(0);
}

await panel.evaluate('document.querySelector(".consent-button")?.click()');
await waitFor(panel, 'Boolean(document.querySelector("#target-tab:not(:disabled)"))', 'consented panel');
await panel.evaluate(`chrome.storage.local.remove(['webbSkillbookV1', 'webbRecentRunV1', 'webbLastVideoV1'])`);
const targetId = await panel.evaluate(`(async () => {
  const tabs = await chrome.tabs.query({});
  return tabs.find(tab => tab.url?.includes('qa=${runId}'))?.id;
})()`);
if (!targetId) throw new Error('Practice site was absent from the extension tab list.');
await panel.evaluate(`(() => {
  const select = document.querySelector('#target-tab');
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${targetId});
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await waitFor(panel, `document.querySelector('#target-tab')?.value === '${targetId}'`, 'target selection');
await panel.evaluate(`document.querySelector('input[aria-label="Type a direct instruction"]').focus()`);
await panel.command('Input.insertText', { text: 'Open Settings' });
console.log(`Typed command state: ${JSON.stringify(await panel.evaluate(`(() => ({
  text: document.querySelector('input[aria-label="Type a direct instruction"]')?.value,
  disabled: document.querySelector('button[aria-label="Send instruction"]')?.disabled,
  target: document.querySelector('#target-tab')?.value,
}))()`))}`);
await waitFor(panel, `Boolean(document.querySelector('button[aria-label="Send instruction"]:not(:disabled)'))`, 'typed instruction');
await panel.evaluate(`document.querySelector('button[aria-label="Send instruction"]').click()`);
try {
  await waitFor(site, 'location.hash === "#settings"', 'Settings navigation', 15000);
} catch (error) {
  console.log(`Panel after command: ${await panel.evaluate('document.body.innerText.slice(-1800)')}`);
  console.log(`Target URL: ${await site.evaluate('location.href')}`);
  throw error;
}
console.log('Typed command opened Settings in the target tab.');

await waitFor(panel, `(async () => {
  const saved = await chrome.storage.local.get('webbRecentRunV1');
  return saved.webbRecentRunV1?.steps?.length === 1;
})()`, 'verified step memory');
console.log('Verified Settings action was stored as a reusable step.');

await waitFor(panel, `Boolean(document.querySelector('input[aria-label="Name this skill"]'))`, 'skill save control');
await panel.evaluate(`document.querySelector('input[aria-label="Name this skill"]').focus()`);
await panel.command('Input.insertText', { text: 'Open Settings QA' });
await panel.evaluate(`document.querySelector('.save-skill-row button').click()`);
await waitFor(panel, `(async () => {
  const saved = await chrome.storage.local.get('webbSkillbookV1');
  return saved.webbSkillbookV1?.some(skill => skill.name === 'Open Settings QA');
})()`, 'saved skill');
console.log('Verified step saved as a skill.');

await site.command('Page.navigate', { url: `https://webb-five-puce.vercel.app/demo/?qa=${runId}` });
await waitFor(site, 'location.hash === "" && document.title.includes("Overview")', 'overview reset');
await panel.evaluate(`document.querySelector('.saved-skills button:not(.remove-skill)').click()`);
await waitFor(site, 'location.hash === "#settings"', 'skill replay', 20000);
await waitFor(panel, `document.querySelector('.skill-run-card')?.innerText.includes('COMPLETE')`, 'skill completion');
console.log('Saved skill replayed and verified against the reset page.');

if (process.env.WEBB_VOICE_TEST === '1') {
  await site.command('Page.navigate', { url: `https://webb-five-puce.vercel.app/demo/?qa=${runId}` });
  await waitFor(site, 'location.hash === "" && document.title.includes("Overview")', 'voice test reset');
  await panel.evaluate(`document.querySelector('button[aria-label="Start microphone"]').click()`);
  try {
    await waitFor(panel, `Boolean(document.querySelector('button[aria-label="Stop microphone"]'))`, 'microphone streaming', 25000);
  } catch (error) {
    console.log(`Microphone status: ${await panel.evaluate('document.body.innerText.slice(-1500)')}`);
    console.log(`Permission state: ${await panel.evaluate(`navigator.permissions.query({name:'microphone'}).then(p=>p.state)`)}`);
    throw error;
  }
  try {
    await waitFor(site, 'location.hash === "#settings"', 'spoken Settings action', 40000);
  } catch (error) {
    console.log(`Voice status: ${await panel.evaluate('document.body.innerText.slice(-2000)')}`);
    throw error;
  }
  console.log('Fake microphone speech was transcribed and opened Settings.');
  await panel.evaluate(`document.querySelector('button[aria-label="Stop microphone"]').click()`);
}

site.close();
panel.close();
