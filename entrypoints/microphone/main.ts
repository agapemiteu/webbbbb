import { browser } from 'wxt/browser';

const button = document.querySelector<HTMLButtonElement>('#enable')!;
const status = document.querySelector<HTMLElement>('#status')!;

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Waiting for Chrome permission...';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach(track => track.stop());
    await browser.storage.local.set({ webbMicPermissionGrantedAt: Date.now() });
    status.textContent = 'Microphone allowed. Return to Webb and press its microphone button.';
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Chrome denied microphone access.';
    status.textContent = `Microphone unavailable: ${detail}. Check Chrome microphone settings and try again.`;
  } finally {
    button.disabled = false;
  }
});
