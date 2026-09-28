import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Webb',
    description: 'Talk to the web.',
    version: '0.4.0',
    icons: {
      16: 'icons/webb-16.png',
      32: 'icons/webb-32.png',
      48: 'icons/webb-48.png',
      128: 'icons/webb-128.png',
    },
    permissions: ['sidePanel', 'tabs', 'activeTab', 'storage', 'scripting', 'tts', 'debugger', 'identity'],
    ...(process.env.WEBB_GOOGLE_CLIENT_ID ? { oauth2: { client_id: process.env.WEBB_GOOGLE_CLIENT_ID, scopes: ['https://www.googleapis.com/auth/documents'] } } : {}),
    host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: 'Open Webb side panel',
      default_icon: {
        16: 'icons/webb-16.png',
        32: 'icons/webb-32.png',
      },
    },
  },
});
