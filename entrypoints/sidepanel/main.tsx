import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { SessionCoordinator, type SessionView } from "../../src/session";
import { Transcriber } from "../../src/transcriber";
import type { PageSnapshot, TranscriptTurn } from "../../src/protocol";
import "./style.css";

type TabOption = { id: number; title: string };
const DEFAULT_API_BASE = "https://webb-api.collins-coordinator-worker.workers.dev";
function Icon({
  name,
  size = 18,
}: {
  name: "settings" | "arrow" | "mic" | "stop" | "spark" | "check" | "refresh";
  size?: number;
}) {
  const paths = {
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="2" />
        <circle cx="15" cy="17" r="2" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h15m-6-6 6 6-6 6" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" />
      </>
    ),
    stop: <rect x="5" y="5" width="14" height="14" rx="3" />,
    spark: (
      <>
        <path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2ZM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8L19 17Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    refresh: (
      <>
        <path d="M20 11a8 8 0 1 0-2.3 6.4" />
        <path d="M20 4v7h-7" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function App() {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [tabs, setTabs] = useState<TabOption[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [followed, setFollowed] = useState<number | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [partial, setPartial] = useState("");
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  const [message, setMessage] = useState(
    "Choose a target website to get started.",
  );
  const [draft, setDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [consented, setConsented] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [view, setView] = useState<SessionView>({
    procedure: { goal: "", steps: [] },
    pending: null,
    events: [],
    busy: false,
  });
  const apiRef = useRef(apiBase);
  const targetRef = useRef(target);
  const followedRef = useRef(followed);
  const consentedRef = useRef(consented);
  const microphone = useRef<Transcriber | null>(null);
  const coordinator = useRef<SessionCoordinator | null>(null);
  apiRef.current = apiBase;
  targetRef.current = target;
  followedRef.current = followed;
  consentedRef.current = consented;
  if (!coordinator.current)
    coordinator.current = new SessionCoordinator(
      () => apiRef.current,
      () => targetRef.current,
      setView,
    );

  async function refreshTabs() {
    if (!consentedRef.current) return;
    const found = await browser.tabs.query({ currentWindow: true });
    setTabs(
      found
        .filter((tab) => tab.id && tab.url?.startsWith("http"))
        .map((tab) => ({
          id: tab.id!,
          title: tab.title || tab.url || "Untitled tab",
        })),
    );
  }
  useEffect(() => {
    browser.storage.local.get(["apiBase", "privacyConsentVersion"]).then((saved) => {
      if (typeof saved.apiBase === "string" && saved.apiBase !== "http://localhost:8787") setApiBase(saved.apiBase);
      if (saved.privacyConsentVersion === "1") setConsented(true);
    });
    const activated = ({ tabId }: { tabId: number }) => {
      if (!consentedRef.current) return;
      void refreshTabs();
      if (tabId !== followedRef.current) {
        setTarget(tabId);
      }
    };
    const onMessage = (event: { type?: string; turn?: TranscriptTurn }) => {
      if (event.type === "TRANSCRIPT" && event.turn?.source === "followed_tab")
        handleTurn(event.turn);
    };
    browser.tabs.onActivated.addListener(activated);
    browser.tabs.onUpdated.addListener(refreshTabs);
    browser.runtime.onMessage.addListener(onMessage);
    return () => {
      browser.tabs.onActivated.removeListener(activated);
      browser.tabs.onUpdated.removeListener(refreshTabs);
      browser.runtime.onMessage.removeListener(onMessage);
      void microphone.current?.stop();
    };
  }, []);

  function handleTurn(turn: TranscriptTurn) {
    if (!turn.final) {
      setPartial(
        `${turn.source === "user" ? "YOU" : "TUTORIAL"}: ${turn.text}`,
      );
      return;
    }
    setPartial("");
    coordinator.current?.receive(turn);
  }
  async function inspect() {
    if (!consented) return;
    try {
      const page = await coordinator.current!.inspect();
      setSnapshot(page);
      setMessage(
        `${page.elements.length} visible controls found on ${page.title}.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inspection failed");
    }
  }
  async function startMic() {
    if (!consented) return;
    try {
      if (micOn) {
        await microphone.current?.stop();
        microphone.current = null;
        setMicOn(false);
        coordinator.current?.setTalkActive(false);
        setMessage("Microphone stopped.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true },
        video: false,
      });
      const transcriber = new Transcriber("user", handleTurn);
      microphone.current = transcriber;
      await transcriber.start(stream, apiRef.current);
      setMicOn(true);
      coordinator.current?.setTalkActive(true);
      setMessage("Listening to you.");
    } catch (error) {
      await microphone.current?.stop();
      microphone.current = null;
      coordinator.current?.setTalkActive(false);
      setMessage(error instanceof Error ? error.message : "Microphone failed");
    }
  }
  async function followCurrentTab() {
    if (!consented) return;
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id || !tab.url?.startsWith("http"))
        throw new Error("Activate the tutorial tab first.");
      const result = (await browser.runtime.sendMessage({
        type: "CAPTURE_TAB",
        tabId: tab.id,
        apiBase: apiRef.current,
      })) as { ok?: boolean; error?: string };
      if (!result?.ok)
        throw new Error(result?.error || "Could not capture tutorial tab.");
      setFollowed(tab.id);
      coordinator.current?.setFollowedTab(tab.id);
      setMessage(
        `Following ${tab.title || "tutorial tab"}. Switch to the target website.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Follow failed");
    }
  }
  async function stopFollow() {
    await browser.runtime.sendMessage({ type: "STOP_FOLLOW" });
    setFollowed(null);
    coordinator.current?.setFollowedTab(null);
    setMessage("Stopped following tutorial audio.");
  }
  function submitText() {
    if (!consented || !draft.trim()) return;
    handleTurn({
      source: "user",
      text: draft.trim(),
      timestamp: Date.now(),
      final: true,
    });
    setDraft("");
  }

  async function acceptPrivacyDisclosure() {
    await browser.storage.local.set({ privacyConsentVersion: "1", privacyConsentAt: Date.now() });
    consentedRef.current = true;
    setConsented(true);
    void refreshTabs();
  }

  async function withdrawPrivacyConsent() {
    await microphone.current?.stop();
    microphone.current = null;
    setMicOn(false);
    if (followedRef.current) await browser.runtime.sendMessage({ type: "STOP_FOLLOW" });
    setFollowed(null);
    coordinator.current?.setFollowedTab(null);
    let cloudSessionDeleted = true;
    try {
      await coordinator.current?.clearSession();
    } catch {
      cloudSessionDeleted = false;
    }
    await browser.storage.local.remove(["privacyConsentVersion", "privacyConsentAt", "webbSessionId"]);
    consentedRef.current = false;
    setConsented(false);
    setTabs([]);
    setTarget(null);
    setSnapshot(null);
    setMessage(cloudSessionDeleted
      ? "Webb stopped and session data was cleared."
      : "Webb stopped. Previously sent data will expire within 24 hours.");
  }

  const followedTitle =
    tabs.find((tab) => tab.id === followed)?.title ||
    (followed ? `Tab ${followed}` : "Choose a tutorial tab");
  const targetTitle =
    tabs.find((tab) => tab.id === target)?.title || "Choose where Webb acts";
  const current = view.current;
  const latestStep = [...view.procedure.steps]
    .reverse()
    .find((step) => step.status === "current");
  const doneCount = view.procedure.steps.filter(
    (step) => step.status === "completed" || step.status === "skipped",
  ).length;
  const progress = view.procedure.steps.length
    ? Math.round((doneCount / view.procedure.steps.length) * 100)
    : 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src="/webb-avatar.svg" alt="" className="brand-avatar" />
          <div>
            <strong>
              webb<span className="brand-dot">.</span>
            </strong>
            <small>Talk to the web.</small>
          </div>
        </div>
        <button
          className="icon-button"
          aria-label="Settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <Icon name="settings" />
        </button>
      </header>
      <main className="main-content">
        {!consented && (
          <section className="privacy-consent" aria-labelledby="privacy-consent-title">
            <span className="eyebrow">BEFORE YOU START</span>
            <h1 id="privacy-consent-title">What Webb reads and sends</h1>
            <p>
              When you start TALK or FOLLOW, Webb sends your chosen microphone or tutorial audio to AssemblyAI for transcription. It sends the transcript and visible controls from your selected page to Webb's Worker and Groq to plan an action. Webb stores the transcript, page context, and action progress in a temporary Cloudflare session for up to 24 hours after your last activity.
            </p>
            <p>
              Audio and page data are used to carry out your instructions. They are not used for advertising. Review the <a href="https://webb-five-puce.vercel.app/privacy.html" target="_blank" rel="noreferrer">privacy policy</a> before continuing.
            </p>
            <p>Do not speak passwords or secret keys. Webb will not fill password fields.</p>
            <button className="consent-button" onClick={() => void acceptPrivacyDisclosure()}>
              Agree and continue <Icon name="arrow" size={16} />
            </button>
          </section>
        )}
        {settingsOpen && (
          <section className="settings-panel" aria-label="Settings">
            <div className="section-heading">
              <h2>Connection</h2>
              <span>SETUP</span>
            </div>
            <label htmlFor="api">Worker URL</label>
            <input
              id="api"
              value={apiBase}
              onChange={(event) => setApiBase(event.target.value)}
              onBlur={() => void browser.storage.local.set({ apiBase })}
            />
            <p>Keep API keys on your Worker.</p>
            <label htmlFor="extension-id">Extension ID</label>
            <input
              id="extension-id"
              readOnly
              value={browser.runtime.id}
              onFocus={(event) => event.currentTarget.select()}
            />
            <p>Use this ID when setting the Worker's allowed origin.</p>
            {consented && (
              <button className="privacy-reset" onClick={() => void withdrawPrivacyConsent()}>
                Withdraw consent and stop Webb
              </button>
            )}
          </section>
        )}
        <section className="flow-card" aria-label="Browser connection">
          <div className="flow-header">
            <span className="eyebrow">LIVE WORKSPACE</span>
            <span className={`live-badge ${followed || micOn ? "on" : ""}`}>
              <span className="live-dot" />
              {followed || micOn ? "LIVE" : "READY"}
            </span>
          </div>
          <div className="flow-row">
            <span className="flow-icon tutorial">01</span>
            <div className="flow-copy">
              <span>TUTORIAL AUDIO</span>
              <strong title={followedTitle}>{followedTitle}</strong>
            </div>
            <span className="flow-state">
              {followed ? "Following" : "Not connected"}
            </span>
          </div>
          <div className="flow-bridge">
            <span />
            <Icon name="arrow" size={15} />
            <span />
          </div>
          <div className="flow-row">
            <span className="flow-icon target">02</span>
            <div className="flow-copy">
              <span>TARGET WEBSITE</span>
              <strong title={targetTitle}>{targetTitle}</strong>
            </div>
            <span className="flow-state">
              {target ? "Selected" : "Select below"}
            </span>
          </div>
        </section>
        <section className="setup-section" aria-label="Choose tabs">
          <div className="section-heading">
            <h2>Connect your tabs</h2>
            <span>01 / SETUP</span>
          </div>
          <p className="section-intro">
            On the tutorial tab, click Webb in the Chrome toolbar, then start
            following. Switch to the target website after capture starts.
          </p>
          <button
            className={`follow-button ${followed ? "following" : ""}`}
            onClick={followed ? stopFollow : followCurrentTab}
            disabled={!consented}
          >
            <span className="button-icon">
              <Icon name={followed ? "stop" : "spark"} size={17} />
            </span>
            <span>
              {followed ? "Stop following" : "Follow active tutorial tab"}
            </span>
            <Icon name="arrow" size={17} />
          </button>
          <div className="target-control">
            <label htmlFor="target-tab">TARGET WEBSITE</label>
            <div className="select-wrap">
              <select
                id="target-tab"
                value={target || ""}
                disabled={!consented}
                onChange={(event) => {
                  const id = Number(event.target.value) || null;
                  setTarget(id);
                  setSnapshot(null);
                }}
              >
                <option value="">Choose a tab</option>
                {tabs
                  .filter((tab) => tab.id !== followed)
                  .map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <button className="text-button" onClick={inspect} disabled={!target || !consented}>
            <Icon name="refresh" size={14} /> Inspect page{" "}
            {snapshot ? `· ${snapshot.elements.length} controls found` : ""}
          </button>
        </section>
        {view.pending && (
          <section className="decision-card" aria-label="Confirmation required">
            <div className="decision-label">
              <span className="alert-dot" /> NEEDS YOU
            </div>
            <h2>{view.pending.description}</h2>
            <p>
              This action requires your approval. Tutorial audio cannot approve
              it.
            </p>
            <div className="decision-actions">
              <button
                className="confirm-button"
                onClick={() => void coordinator.current?.confirmFromButton()}
              >
                Confirm action <Icon name="arrow" size={16} />
              </button>
              <button
                className="cancel-button"
                onClick={() => coordinator.current?.cancel()}
              >
                Cancel
              </button>
            </div>
          </section>
        )}
        {(current || latestStep || partial) && (
          <section className="step-card" aria-label="Current action">
            <div className="section-heading">
              <h2>Current step</h2>
              <span>
                {current?.state === "verified"
                  ? "VERIFIED"
                  : view.busy
                    ? "WORKING"
                    : "IN PROGRESS"}
              </span>
            </div>
            {current ? (
              <>
                <div className="match-line">
                  <span>
                    {current.source === "user" ? "YOU SAID" : "TUTORIAL SAYS"}
                  </span>
                  <strong>{current.heard}</strong>
                </div>
                <div className="match-connector">
                  <Icon name="arrow" size={16} /> Webb matched the current page
                </div>
                <div className="match-line matched">
                  <span>YOUR SCREEN</span>
                  <strong>{current.matched}</strong>
                </div>
              </>
            ) : (
              <p className="step-title">{latestStep?.instruction || partial}</p>
            )}
          </section>
        )}
        <section className="progress-section" aria-label="Procedure progress">
          <div className="section-heading">
            <h2>Progress</h2>
            <span>
              {doneCount}/{view.procedure.steps.length} STEPS
            </span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          {view.procedure.goal && <p className="goal">{view.procedure.goal}</p>}
          {view.procedure.steps.length ? (
            <ol className="step-list">
              {view.procedure.steps.slice(-4).map((step) => (
                <li key={step.id} className={step.status}>
                  <span className="step-marker">
                    {step.status === "completed" ? (
                      <Icon name="check" size={12} />
                    ) : step.status === "skipped" ? (
                      "−"
                    ) : (
                      ""
                    )}
                  </span>
                  <span>{step.instruction}</span>
                  <small>{step.status}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-note">
              Steps appear here as Webb follows along.
            </p>
          )}
        </section>
        <section className="activity-section">
          <button
            className="activity-toggle"
            aria-expanded={activityOpen}
            onClick={() => setActivityOpen(!activityOpen)}
          >
            <span>Activity</span>
            <span>
              {view.events.length
                ? `${view.events.length} events`
                : "No activity yet"}{" "}
              <span className={`chevron ${activityOpen ? "open" : ""}`}>⌄</span>
            </span>
          </button>
          {activityOpen && (
            <ol className="activity-list">
              {view.events.length ? (
                view.events.map((event, index) => (
                  <li key={`${index}-${event}`}>{event}</li>
                ))
              ) : (
                <li>Speech and browser actions will show here.</li>
              )}
            </ol>
          )}
        </section>
      </main>
      <footer className="command-dock">
        <div className="dock-status" role="status">
          <span
            className={`status-indicator ${view.busy ? "working" : micOn || followed ? "live" : ""}`}
          />
          {view.busy ? "Webb is working" : message}
        </div>
        {partial && <p className="live-transcript">{partial}</p>}
        <div className="command-row">
          <button
            className={`mic-button ${micOn ? "active" : ""}`}
            onClick={startMic}
            disabled={!consented}
            aria-label={micOn ? "Stop microphone" : "Start microphone"}
            title={micOn ? "Stop microphone" : "Talk to Webb"}
          >
            <Icon name={micOn ? "stop" : "mic"} size={20} />
          </button>
          <div className="command-input">
            <input
              aria-label="Type a direct instruction"
              placeholder="Tell Webb what to do..."
              value={draft}
              disabled={!consented}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitText();
              }}
            />
            <button
              onClick={submitText}
              disabled={!draft.trim()}
              aria-label="Send instruction"
            >
              <Icon name="arrow" size={17} />
            </button>
          </div>
        </div>
        <p className="dock-hint">Your instructions always take priority.</p>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
