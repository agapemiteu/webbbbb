import { writeFile } from 'node:fs/promises';

const targets = await fetch('http://127.0.0.1:9224/json/list').then(response => response.json());
const panel = targets.find(target => target.type === 'page' && target.url?.endsWith('/sidepanel.html'));
if (!panel) throw new Error('Open the Webb sidepanel.html target in the debug Chrome first.');

const socket = new WebSocket(panel.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
};
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const commandId = ++id;
    pending.set(commandId, { resolve, reject });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
}

await command('Emulation.setDeviceMetricsOverride', { width: 380, height: 820, deviceScaleFactor: 1, mobile: false });
await command('Page.enable');
await new Promise(resolve => setTimeout(resolve, 700));
const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile('panel-review.png', Buffer.from(screenshot.data, 'base64'));
const result = await command('Runtime.evaluate', { expression: 'document.body.innerText.slice(0, 1000)', returnByValue: true });
process.stdout.write(`${result.result.value}\n`);
socket.close();
