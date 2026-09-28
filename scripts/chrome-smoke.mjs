import { readFile, writeFile } from 'node:fs/promises';

const port = Number(process.env.WEBB_CDP_PORT || 9225);
const base = `http://127.0.0.1:${port}`;
if (process.env.WEBB_ISOLATED_PROFILE !== '1') throw new Error('Run this smoke test only in an isolated Chromium profile. Set WEBB_ISOLATED_PROFILE=1 to confirm.');

class DevTools {
  constructor(socket, targetId) {
    this.socket = socket;
    this.targetId = targetId;
    this.nextId = 0;
    this.pending = new Map();
    this.events = [];
    socket.onclose = () => {
      for (const { reject } of this.pending.values()) reject(new Error('Test page connection closed.'));
      this.pending.clear();
    };
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
    return new DevTools(socket, target.id);
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

  async close() {
    await fetch(`${base}/json/close/${this.targetId}`).catch(() => {});
    this.socket.close();
  }
}

async function targets() {
  return fetch(`${base}/json/list`).then(response => response.json());
}

async function openPage(url) {
  const response = await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Chrome could not open ${url}: ${response.status}`);
  return DevTools.connect(await response.json());
}

async function waitFor(client, expression, label, timeoutMs = 30000) {
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
for (const target of await targets()) {
  if (target.type === 'page' && (target.url.includes('qa=webbqa') || target.url === `chrome-extension://${extensionId}/sidepanel.html`)) {
    await fetch(`${base}/json/close/${target.id}`);
  }
}

const runId = `webbqa${Date.now()}`;
const practiceUrl = `https://webb-five-puce.vercel.app/demo/?qa=${runId}`;
const site = await openPage(process.env.WEBB_DOCS_BLOCKED_TEST === '1' ? 'about:blank' : practiceUrl);
if (process.env.WEBB_DOCS_BLOCKED_TEST === '1') {
  site.socket.addEventListener('message', async event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Fetch.requestPaused' && message.params.request.url === practiceUrl) {
      await site.command('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{name:'Content-Type',value:'text/html'}], body: Buffer.from('<!doctype html><title>Acme input failure fixture</title><p>Input failure fixture</p>').toString('base64') });
    }
  });
  await site.command('Fetch.enable', { patterns: [{ urlPattern: practiceUrl }] });
  await site.command('Page.navigate', { url: practiceUrl });
}
await waitFor(site, 'document.readyState === "complete" && document.title.includes("Acme")', 'practice site');
console.log(`Practice site loaded: ${await site.evaluate('document.title')}`);

const panel = await openPage(`chrome-extension://${extensionId}/sidepanel.html`);
await panel.command('Runtime.enable');
try { await waitFor(panel, 'Boolean(document.querySelector(".consent-button, .source-mode"))', 'Webb panel'); }
catch (error) {
  console.log(`Panel body: ${await panel.evaluate('document.body.innerText.slice(0,1200)').catch(() => '<unavailable>')}`);
  console.log(`Panel exceptions: ${JSON.stringify(panel.events.filter(event => event.method === 'Runtime.exceptionThrown').map(event => event.params.exceptionDetails.text))}`);
  throw error;
}
console.log(`Panel loaded: ${await panel.evaluate('document.title')}`);

console.log(`Extension runtime: ${await panel.evaluate('chrome.runtime.id')}`);
if (process.env.WEBB_DOCS_BLOCKED_TEST === '1') {
  await panel.evaluate(`window.fetch = async (url) => new Response(JSON.stringify(String(url).endsWith('/plan')
    ? { kind: 'instruction', confidence: 1, goal: 'Append document text', action: { id: 'blocked-input-qa', type: 'append', target: 'docs_body', risk: 'prepare', value: 'Webb document input checked.' } }
    : { sessionId: 'local-input-failure-qa', revision: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } })`);
}
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
  await panel.close();
  await site.close();
  process.exit(0);
}

await panel.evaluate('document.querySelector(".consent-button")?.click()');
await panel.evaluate(`(() => { const button = Array.from(document.querySelectorAll('.source-mode button')).find(item => item.textContent.includes('Act on instructions')); if (button?.getAttribute('aria-pressed') !== 'true') button?.click(); })()`);
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
if (process.env.WEBB_FORM_TEST === '1') {
  await site.command('Page.navigate', { url: `https://webb-five-puce.vercel.app/demo/form.html?qa=${runId}` });
  await waitFor(site, `Boolean(document.querySelector('#request-type'))`, 'support form');
  async function fill(text) {
    await panel.evaluate(`document.querySelector('input[aria-label="Type a direct instruction"]').select()`);
    await panel.command('Input.insertText', { text });
    await panel.evaluate(`document.querySelector('button[aria-label="Send instruction"]').click()`);
  }
  await fill('Fill Project name with Webb QA');
  await waitFor(site, `document.querySelector('#project-name').value === 'Webb QA'`, 'guided field fill');
  await fill('Select Deployment in What do you need help with');
  await waitFor(site, `document.querySelector('#request-type').value === 'Deployment'`, 'guided dropdown selection');
  if (await site.evaluate(`document.querySelector('#form-status').innerText`)) throw new Error('Form was submitted without approval.');
  console.log('Guided text filling and native dropdown selection passed without submission.');
  await panel.close(); await site.close(); process.exit(0);
}
if (process.env.WEBB_POINTER_TEST === '1') {
  async function steer(text) {
    await panel.evaluate(`document.querySelector('input[aria-label="Type a direct instruction"]').select()`);
    await panel.command('Input.insertText', { text });
    await panel.evaluate(`document.querySelector('button[aria-label="Send instruction"]').click()`);
  }
  await steer('Move right');
  await waitFor(site, `Boolean(document.querySelector('[data-webb-pointer]'))`, 'visible Webb cursor');
  const initial = await site.evaluate(`document.querySelector('[data-webb-pointer]').getBoundingClientRect().left`);
  await waitFor(site, `document.querySelector('[data-webb-pointer]').getBoundingClientRect().left > ${initial + 20}`, 'gradual pointer movement');
  await steer('Stop');
  await waitFor(panel, `document.querySelector('.dock-status')?.innerText.includes('pointer ready')`, 'pointer stopped');
  const stopped = await site.evaluate(`document.querySelector('[data-webb-pointer]').getBoundingClientRect().left`);
  await new Promise(resolve => setTimeout(resolve, 400));
  if (await site.evaluate(`document.querySelector('[data-webb-pointer]').getBoundingClientRect().left`) !== stopped) throw new Error('Pointer kept moving after Stop.');
  await site.evaluate(`(() => { const rect = document.querySelector('[data-webb-pointer]').getBoundingClientRect(); const button = document.createElement('button'); button.textContent = 'Delete record'; button.style.cssText = 'position:fixed;z-index:1000;width:120px;height:50px'; button.style.left = (rect.left - 20) + 'px'; button.style.top = (rect.top - 10) + 'px'; button.onclick = () => { button.textContent = 'Record removed'; }; document.body.appendChild(button); })()`);
  await steer('Click');
  await waitFor(panel, `Boolean(document.querySelector('[aria-label="Confirmation required"]'))`, 'pointer click approval');
  if (await site.evaluate(`document.body.innerText.includes('Record removed')`)) throw new Error('Pointer bypassed destructive approval.');
  await steer('Go ahead');
  await waitFor(site, `document.body.innerText.includes('Record removed')`, 'approved pointer click');
  console.log('Webb cursor moved gradually, stopped, and required approval for a destructive pointer click. Physical mouse movement was not used.');
  await panel.close(); await site.close(); process.exit(0);
}
if (process.env.WEBB_TASK_TEST === '1') {
  await site.evaluate(`(() => {
    document.title = 'Mail execution fixture';
    document.body.innerHTML = '<button id="compose">Compose</button><div id="draft"></div><p id="sent"></p>';
    document.querySelector('#compose').onclick = () => {
      document.querySelector('#draft').innerHTML = '<label>To<input id="to" type="email"></label><label>Subject<input id="subject"></label><div role="textbox" contenteditable="true" aria-label="Message body" id="body" style="min-height:60px"></div><button id="send">Send</button>';
      document.querySelector('#send').onclick = () => { document.querySelector('#sent').textContent = 'Practice message sent'; document.querySelector('#draft').innerHTML = ''; };
    };
  })()`);
  async function command(text) {
    await panel.evaluate(`document.querySelector('input[aria-label="Type a direct instruction"]').select()`);
    await panel.command('Input.insertText', { text });
    await panel.evaluate(`document.querySelector('button[aria-label="Send instruction"]').click()`);
  }
  await command('Compose an email to qa@example.com with subject Webb review and message Please review the release. Then send it.');
  try { await waitFor(panel, `Boolean(document.querySelector('[aria-label="Confirmation required"]'))`, 'email approval', 60000); } catch (error) { console.log(await panel.evaluate('document.body.innerText')); throw error; }
  const draft = await site.evaluate(`({ to: document.querySelector('#to')?.value, subject: document.querySelector('#subject')?.value, body: document.querySelector('#body')?.textContent, sent: document.querySelector('#sent')?.textContent })`);
  if (draft.to !== 'qa@example.com' || draft.subject !== 'Webb review' || !draft.body?.includes('Please review the release') || draft.sent) throw new Error('Compound email task did not prepare the expected draft: ' + JSON.stringify(draft));
  console.log('One request opened Compose and filled recipient, subject, and editable body, then waited for approval.');
  await site.evaluate(`document.querySelector('#subject').value = 'Changed after approval request'`);
  await command('Go ahead');
  await waitFor(panel, `document.body.innerText.includes('The draft changed')`, 'changed draft approval rejection');
  if (await site.evaluate(`document.querySelector('#sent').textContent`)) throw new Error('A changed draft was sent.');
  console.log('Changed draft invalidated the pending approval. Nothing was sent.');
  await command('Send this email.');
  await waitFor(panel, `Boolean(document.querySelector('[aria-label="Confirmation required"]'))`, 'fresh approval');
  await command('Go ahead');
  await waitFor(site, `document.querySelector('#sent').textContent === 'Practice message sent'`, 'approved practice send');
  console.log('Fresh direct approval completed the practice send. No real email was sent by this test.');
  await panel.close(); await site.close(); process.exit(0);
}
if (process.env.WEBB_DOCS_TEST === '1') {
  const url = 'https://docs.google.com/document/d/webb-input-qa/edit';
  const fixture = '<!doctype html><title>Document input fixture</title><div class="kix-appview-editor" style="width:600px;height:400px"><div class="kix-lineview-text-block" role="textbox" aria-label="Document body" contenteditable="true" style="width:600px;height:400px">Previously saved paragraph.</div></div>';
  const handler = async event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Fetch.requestPaused') await site.command('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{name:'Content-Type',value:'text/html'}], body: Buffer.from(fixture).toString('base64') });
  };
  site.socket.addEventListener('message', handler);
  await site.command('Fetch.enable', { patterns: [{ urlPattern: url }] });
  await site.command('Page.navigate', { url });
  await waitFor(site, `Boolean(document.querySelector('.kix-appview-editor'))`, 'intercepted editor fixture');
  if (process.env.WEBB_DOCS_BLOCKED_TEST === '1') {
    await panel.evaluate(`(() => {
      window.webbAttachForTest = chrome.debugger.attach.bind(chrome.debugger);
      chrome.debugger.attach = async () => { throw new Error('Cannot access a chrome-extension:// URL of different extension'); };
    })()`);
  }
  await panel.evaluate(`document.querySelector('input[aria-label="Type a direct instruction"]').select()`);
  await panel.command('Input.insertText', { text: 'Append Webb document input checked. to the end of this Google Docs document.' });
  await panel.evaluate(`document.querySelector('button[aria-label="Send instruction"]').click()`);
  if (process.env.WEBB_DOCS_BLOCKED_TEST === '1') {
    await waitFor(panel, `document.body.innerText.includes('Chrome reports a conflict with another extension')`, 'specific Chrome rejection');
    await waitFor(panel, `document.querySelector('[aria-label="Current action"] .section-heading')?.innerText.includes('FAILED')`, 'failed action heading');
    if (await site.evaluate(`document.querySelector('.kix-lineview-text-block').textContent`) !== 'Previously saved paragraph.') throw new Error('Blocked attachment changed document text.');
    console.log('Blocked browser input preserved the Chrome error, showed FAILED, and left document text untouched.');
    await panel.close(); await site.close(); process.exit(0);
  }
  try {
    await waitFor(panel, `document.body.innerText.includes('Done. Append text to')`, 'verified document append', 30000);
  } catch (error) { console.log(await panel.evaluate('document.body.innerText')); throw error; }
  const content = await site.evaluate(`document.querySelector('.kix-lineview-text-block').textContent`);
  if (!content.includes('Previously saved paragraph.') || !content.includes('Webb document input checked.')) throw new Error('Document append replaced or lost text.');
  console.log('Trusted document input appended and verified text without replacing existing content. This fixture does not prove signed-in Google Docs compatibility.');
  await panel.close(); await site.close(); process.exit(0);
}
if (process.env.WEBB_SHARE_TEST) {
  const tutorial = await openPage(`https://webb-five-puce.vercel.app/demo/tutorial.html?qa=${runId}`);
  await waitFor(tutorial, `Boolean(document.querySelector('#lesson-list button'))`, 'source page');
  await tutorial.evaluate(`document.title = 'WebbSourceQA'`);
  await waitFor(tutorial, `document.title === 'WebbSourceQA'`, 'unique source title');
  const sourceId = await panel.evaluate(`(async () => (await chrome.tabs.query({})).find(tab => tab.url?.includes('tutorial.html?qa=${runId}'))?.id)()`);
  if (!sourceId) throw new Error('Source tab was absent.');
  await panel.evaluate(`chrome.tabs.update(${sourceId}, {active:true})`);
  const modeLabel = process.env.WEBB_SHARE_TEST === 'notes' ? 'Listen and assist' : 'Act on instructions';
  await panel.evaluate(`(() => { const button = Array.from(document.querySelectorAll('.source-mode button')).find(item => item.textContent.includes(${JSON.stringify(modeLabel)})); if (button?.getAttribute('aria-pressed') !== 'true') button?.click(); })()`);
  await waitFor(panel, `document.querySelector('.source-mode button[aria-pressed="true"]')?.textContent.includes(${JSON.stringify(modeLabel)})`, `${modeLabel} mode`);
  const unhappy = process.env.WEBB_SHARE_TEST;
  if (unhappy === 'cancel' || unhappy === 'noaudio') {
    await panel.evaluate(unhappy === 'cancel'
      ? `navigator.mediaDevices.getDisplayMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); }`
      : `navigator.mediaDevices.getDisplayMedia = async () => new MediaStream()`);
    await panel.evaluate(`document.querySelector('.follow-button').click()`);
    await waitFor(panel, `document.body.innerText.includes('Tab audio was not shared') && !document.querySelector('.follow-button').disabled`, `${unhappy} recovery`);
    if (await panel.evaluate(`Boolean(document.querySelector('.follow-button.following'))`)) throw new Error('Failed sharing was reported as connected.');
    console.log(`Sharing ${unhappy} recovered with a clear retry instruction and no active capture.`);
    await tutorial.close(); await panel.close(); await site.close(); process.exit(0);
  }
  await panel.evaluate(`document.querySelector('.follow-button').click()`);
  try {
    await waitFor(panel, `Boolean(document.querySelector('.follow-button.following'))`, 'shared tab audio', 20000);
  } catch (error) {
    console.log(`Sharing status: ${await panel.evaluate('document.body.innerText.slice(-1600)')}`);
    throw error;
  }
  console.log('Source tab audio connected to AssemblyAI.');
  if (process.env.WEBB_TTS_TEST === '1') {
    const result = await panel.evaluate(`new Promise(resolve => {
      const timeout = setTimeout(() => resolve('timeout'), 20000);
      chrome.tts.speak('Webb is ready.', { lang: 'en-US', requiredEventTypes: ['end'], onEvent: event => {
        if (['end', 'error'].includes(event.type)) { clearTimeout(timeout); resolve(event.type + (event.errorMessage || '')); }
      } }, () => { if (chrome.runtime.lastError) { clearTimeout(timeout); resolve(chrome.runtime.lastError.message); } });
    })`);
    if (result !== 'end') throw new Error(`Native spoken reply failed: ${result}`);
    console.log('Chrome native speech playback reached its completion event.');
  }
  const audio = (await readFile(process.env.WEBB_AUDIO_WAV)).toString('base64');
  await tutorial.evaluate(`(() => { window.webbQaAudio = new Audio('data:audio/wav;base64,${audio}'); return window.webbQaAudio.play().then(() => true); })()`);
  if (process.env.WEBB_SHARE_TEST === 'notes') {
    await waitFor(panel, `document.querySelector('.source-notes-text')?.innerText.toLowerCase().includes('settings')`, 'captured source notes', 45000);
    console.log(`Captured source note: ${await panel.evaluate(`document.querySelector('.source-notes-text')?.innerText`)}`);
    if (await site.evaluate('location.hash') !== '') throw new Error('Notes mode performed a browser action.');
  } else {
    await waitFor(site, `location.hash === '#settings'`, 'spoken source action on target tab', 45000);
    console.log('Spoken source instruction opened Settings in the target tab.');
  }
  await panel.evaluate(`document.querySelector('input[aria-label="Type a direct instruction"]').select()`);
  await panel.command('Input.insertText', { text: 'What is playing?' });
  await panel.evaluate(`document.querySelector('button[aria-label="Send instruction"]').click()`);
  await waitFor(panel, `document.querySelector('.dock-status')?.innerText.includes('Listening to')`, 'source question answer');
  console.log('Webb answered which source is playing.');
  if (process.env.WEBB_SHARE_TEST === 'notes') {
    await panel.evaluate(`document.querySelector('input[aria-label="Type a direct instruction"]').select()`);
    await panel.command('Input.insertText', { text: 'What did the source just ask us to open?' });
    await panel.evaluate(`document.querySelector('button[aria-label="Send instruction"]').click()`);
    await waitFor(panel, `document.querySelector('[aria-label="Webb reply"]')?.innerText.toLowerCase().includes('settings')`, 'source-context answer', 30000);
    if (await site.evaluate('location.hash') !== '') throw new Error('A source question performed an action.');
    console.log('Webb answered from captured source context without performing an action.');
    await panel.evaluate(`document.querySelector('input[aria-label="Type a direct instruction"]').select()`);
    await panel.command('Input.insertText', { text: 'Can you open Settings for me?' });
    await panel.evaluate(`document.querySelector('button[aria-label="Send instruction"]').click()`);
    await waitFor(site, `location.hash === '#settings'`, 'direct request while source is playing', 30000);
    console.log('Direct user request executed while the source stayed connected in Listen and assist.');
    await site.command('Page.navigate', { url: `https://webb-five-puce.vercel.app/demo/form.html?qa=${runId}` });
    await waitFor(site, `Boolean(document.querySelector('#request-message'))`, 'support form');
    await panel.evaluate(`document.querySelector('input[aria-label="Type a direct instruction"]').select()`);
    await panel.command('Input.insertText', { text: 'Write a short note about what the source just said in the Tell us a little more field.' });
    await panel.evaluate(`document.querySelector('button[aria-label="Send instruction"]').click()`);
    await waitFor(site, `document.querySelector('#request-message')?.value.toLowerCase().includes('settings')`, 'source-based field draft', 30000);
    if (await site.evaluate(`document.querySelector('#form-status')?.innerText`) !== '') throw new Error('Draft was submitted without approval.');
    console.log('Source context was drafted into a supported form field without submission.');

  }

  if (process.env.WEBB_SCREENSHOT_PATH) {
    await panel.command('Emulation.setDeviceMetricsOverride', { width: 380, height: 900, deviceScaleFactor: 1, mobile: false });
    const shot = await panel.command('Page.captureScreenshot');
    await writeFile(process.env.WEBB_SCREENSHOT_PATH, Buffer.from(shot.data, 'base64'));
  }
  await panel.evaluate(`document.querySelector('.follow-button.following').click()`);
  await tutorial.close();
  await panel.close();
  await site.close();
  process.exit(0);
}
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
await panel.evaluate(`document.querySelector('input[aria-label="Name this skill"]').select()`);
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

await site.close();
await panel.close();
