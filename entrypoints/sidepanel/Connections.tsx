import React, { useEffect, useState } from 'react';
import { connectGoogleDocs, disconnectGoogleDocs, googleDocsConfigured, googleDocsConnected } from '../../src/google-docs';

export function Connections({ consented, notify }: { consented: boolean; notify: (message: string) => void }) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const configured = googleDocsConfigured();
  useEffect(() => {
    let active = true;
    if (consented) void googleDocsConnected().then(value => { if (active) setConnected(value); });
    else setConnected(false);
    return () => { active = false; };
  }, [consented]);
  async function changeConnection() {
    if (busy || !consented) return;
    setBusy(true);
    try {
      if (connected) {
        await disconnectGoogleDocs();
        setConnected(false);
        notify('Google Docs disconnected from Webb. You can also revoke Webb access in your Google account.');
      } else {
        await connectGoogleDocs();
        setConnected(true);
        notify('Google Docs authorized. Select an editable document and dictate what to append.');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The connection failed. Try again.');
    } finally { setBusy(false); }
  }
  return <section className="connections" aria-label="Your connections">
    <h3>Your connections</h3>
    <p>Choose any supported webpage as your target. Forms use the page you already have open. Account integrations ask for your permission separately.</p>
    <div className="connection-card">
      <div><strong>Web forms</strong><small>Available on editable webpage fields. Review before submitting.</small></div>
      <span className="connection-status">No connection needed</span>
    </div>
    <div className="connection-card">
      <div><strong>Google Docs</strong><small>Append dictated text to your selected document. Google controls account access.</small></div>
      <span className="connection-status" role="status">{busy ? 'Working…' : !configured ? 'Coming soon' : connected ? 'Authorized' : 'Not connected'}</span>
      <button className="text-button" disabled={!consented || !configured || busy} onClick={() => void changeConnection()}>{connected ? 'Disconnect' : 'Connect Google Docs'}</button>
      {connected && <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">Manage Google permissions</a>}
    </div>
    {!configured && <p>Google Docs account connection is not available in this release yet. You do not need to supply API keys.</p>}
  </section>;
}
