import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { SessionCoordinator, type SessionView } from "../../src/session";
import { Transcriber } from "../../src/transcriber";
import type { PageSnapshot, TranscriptTurn } from "../../src/protocol";
import { clearSkillbook, deleteSkill, loadSkillbook, saveRecentAsSkill, SKILLS_KEY, RECENT_RUN_KEY, LAST_VIDEO_KEY } from "../../src/skillbook";
import { requestedSkill, videoSource, type RecentRun, type SkillSource, type WebbSkill } from "../../src/skill-model";
import { targetForFollow } from "../../src/follow-target";
import "./style.css";

type TabOption = { id: number; title: string };
type FollowSuggestion = { tabId: number; source: SkillSource; createdAt: number };
type PendingFollow = { tabId: number; apiBase: string; source: SkillSource; requestedAt: number };
type FollowPhase = { tabId: number; step: 'toolbar' | 'capturing' | 'connected' | 'error'; detail?: string; updatedAt: number };
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
  const [micPermissionIssue, setMicPermissionIssue] = useState(false);
  const [partial, setPartial] = useState("");
  const [latestTutorialText, setLatestTutorialText] = useState("");
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  const [message, setMessage] = useState(
    "Choose a target website to get started.",
  );
  const [draft, setDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [consented, setConsented] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [skills, setSkills] = useState<WebbSkill[]>([]);
  const [recentRun, setRecentRun] = useState<RecentRun | null>(null);
  const [lastVideo, setLastVideo] = useState<SkillSource | null>(null);
  const [followSuggestion, setFollowSuggestion] = useState<FollowSuggestion | null>(null);
  const [pendingFollow, setPendingFollow] = useState<PendingFollow | null>(null);
  const [followPhase, setFollowPhase] = useState<FollowPhase | null>(null);
  const [skillName, setSkillName] = useState("");
  const [skillValue, setSkillValue] = useState("");
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
  const skillsRef = useRef(skills);
  const viewRef = useRef(view);
  const microphone = useRef<Transcriber | null>(null);
  const coordinator = useRef<SessionCoordinator | null>(null);
  apiRef.current = apiBase;
  targetRef.current = target;
  followedRef.current = followed;
  consentedRef.current = consented;
  skillsRef.current = skills;
  viewRef.current = view;
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
  async function refreshSkills() {
    const memory = await loadSkillbook();
    setSkills(memory.skills);
    setRecentRun(memory.recent);
    setLastVideo(memory.lastVideo);
    if (memory.recent?.source) setSkillName(current => current || memory.recent!.source!.title.slice(0, 80));
  }
  useEffect(() => {
    browser.storage.local.get(["apiBase", "privacyConsentVersion", "webbAutoMode", "webbFollowSuggestion", "webbActiveFollow", "webbPendingFollow", "webbFollowNotice", "webbFollowPhase"]).then((saved) => {
      if (typeof saved.apiBase === "string" && saved.apiBase !== "http://localhost:8787") setApiBase(saved.apiBase);
      if (saved.privacyConsentVersion === "1") setConsented(true);
      if (saved.webbAutoMode === true) setAutoMode(true);
      if (typeof saved.webbActiveFollow === 'number') setFollowed(saved.webbActiveFollow);
      const pending = saved.webbPendingFollow as PendingFollow | undefined;
      if (pending?.tabId && Date.now() - pending.requestedAt < 2 * 60_000) {
        setPendingFollow(pending);
        setMessage('Click the pinned Webb toolbar icon on the tutorial tab to start FOLLOW.');
      }
      if (typeof saved.webbFollowNotice === 'string') setMessage(saved.webbFollowNotice);
      if (saved.webbFollowPhase && typeof saved.webbFollowPhase === 'object') setFollowPhase(saved.webbFollowPhase as FollowPhase);
      const suggestion = saved.webbFollowSuggestion as FollowSuggestion | undefined;
      if (suggestion?.tabId && suggestion.source && Date.now() - suggestion.createdAt < 10 * 60_000) setFollowSuggestion(suggestion);
    });
    void refreshSkills();
    const activated = ({ tabId }: { tabId: number }) => {
      if (!consentedRef.current) return;
      void refreshTabs();
    };
    const onMessage = (event: { type?: string; turn?: TranscriptTurn }) => {
      if (event.type === "TRANSCRIPT" && event.turn?.source === "followed_tab")
        handleTurn(event.turn);
    };
    const onStorageChanged = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'local') return;
      if ([SKILLS_KEY, RECENT_RUN_KEY, LAST_VIDEO_KEY].some(key => key in changes)) void refreshSkills();
      if ('webbFollowSuggestion' in changes) {
        void browser.storage.local.get('webbFollowSuggestion').then(saved => {
          const suggestion = saved.webbFollowSuggestion as FollowSuggestion | undefined;
          setFollowSuggestion(suggestion?.tabId && suggestion.source && Date.now() - suggestion.createdAt < 10 * 60_000 ? suggestion : null);
        });
      }
      if ('webbActiveFollow' in changes) {
        void browser.storage.local.get('webbActiveFollow').then(saved => {
          const sourceTab = typeof saved.webbActiveFollow === 'number' ? saved.webbActiveFollow : null;
          setFollowed(sourceTab);
          coordinator.current?.setFollowedTab(sourceTab);
          if (sourceTab && targetRef.current === sourceTab) { targetRef.current = null; setTarget(null); }
        });
      }
      if ('webbPendingFollow' in changes) {
        void browser.storage.local.get('webbPendingFollow').then(saved => {
          const pending = (saved.webbPendingFollow as PendingFollow | undefined) || null;
          setPendingFollow(pending);
          if (pending) setMessage('Click the pinned Webb toolbar icon on the tutorial tab to start FOLLOW.');
        });
      }
      if ('webbFollowNotice' in changes) {
        void browser.storage.local.get('webbFollowNotice').then(saved => {
          if (typeof saved.webbFollowNotice === 'string') setMessage(saved.webbFollowNotice);
        });
      }
      if ('webbFollowPhase' in changes) {
        void browser.storage.local.get('webbFollowPhase').then(saved => setFollowPhase((saved.webbFollowPhase as FollowPhase | undefined) || null));
      }
      if ('webbMicPermissionGrantedAt' in changes) {
        setMicPermissionIssue(false);
        setMessage('Microphone access is ready. Press the mic to talk to Webb.');
      }
    };
    browser.tabs.onActivated.addListener(activated);
    browser.tabs.onUpdated.addListener(refreshTabs);
    browser.runtime.onMessage.addListener(onMessage);
    browser.storage.onChanged.addListener(onStorageChanged);
    return () => {
      browser.tabs.onActivated.removeListener(activated);
      browser.tabs.onUpdated.removeListener(refreshTabs);
      browser.runtime.onMessage.removeListener(onMessage);
      browser.storage.onChanged.removeListener(onStorageChanged);
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
    if (turn.source === 'followed_tab') {
      setLatestTutorialText(turn.text);
      if (!targetRef.current || targetRef.current === followedRef.current) {
        setMessage('Tutorial audio is working. Choose a different target website before Webb acts.');
        return;
      }
    }
    if (turn.source === 'user' && viewRef.current.skill?.status !== 'needs_value') {
      const skill = requestedSkill(turn.text, skillsRef.current);
      if (skill !== undefined) {
        if (skill) runSkill(skill);
        else setMessage('No saved skill matches that name. Choose one below.');
        return;
      }
    }
    coordinator.current?.receive(turn);
  }
  function runSkill(skill: WebbSkill) {
    try {
      coordinator.current?.startSkill(skill);
      setMessage(`Running ${skill.name} on the selected page.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start skill.');
    }
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
      if (!followedRef.current) coordinator.current?.startManualMemory();
      microphone.current = transcriber;
      await transcriber.start(stream, apiRef.current);
      setMicOn(true);
      setMicPermissionIssue(false);
      coordinator.current?.setTalkActive(true);
      setMessage("Listening to you.");
    } catch (error) {
      await microphone.current?.stop();
      microphone.current = null;
      coordinator.current?.setTalkActive(false);
      const detail = error instanceof Error ? error.message : 'Microphone failed';
      const permissionIssue = /permission dismissed|permission denied|notallowederror/i.test(detail);
      setMicPermissionIssue(permissionIssue);
      setMessage(permissionIssue ? 'Microphone permission needs to be granted in a Chrome tab.' : detail);
    }
  }
  async function followTab(tab: { id?: number; url?: string; title?: string }) {
    if (!consented) return;
    try {
      if (!tab?.id || !tab.url?.startsWith("http"))
        throw new Error("Activate the tutorial tab first.");
      const [active] = await browser.tabs.query({ active: true, currentWindow: true });
      if (active?.id !== tab.id) throw new Error('Activate the video tab before starting FOLLOW.');
      const safeTarget = targetForFollow(targetRef.current, tab.id);
      if (safeTarget !== targetRef.current) { targetRef.current = safeTarget; setTarget(safeTarget); setSnapshot(null); }
      const source = videoSource(tab.title || 'Tutorial', tab.url);
      if (!source) throw new Error('This tab cannot be followed. Choose a website with audio.');
      const streamIdPromise = browser.tabCapture.getMediaStreamId({ targetTabId: tab.id }).catch(() => null);
      setLatestTutorialText('');
      setFollowPhase(null);
      await browser.storage.local.remove('webbFollowPhase');
      await browser.storage.local.remove('webbFollowNotice');
      try {
        const streamId = await streamIdPromise;
        const result = streamId ? await browser.runtime.sendMessage({ type: 'CAPTURE_FOLLOW', tabId: tab.id, apiBase: apiRef.current, streamId, source }) as { ok?: boolean; error?: string } : null;
        if (result?.ok) {
          setMessage(`Following ${source.title}.`);
          return;
        }
      } catch { /* Chrome may require a toolbar click to grant this tab access. */ }
      await browser.storage.local.set({ webbPendingFollow: { tabId: tab.id, apiBase: apiRef.current, source, requestedAt: Date.now() } satisfies PendingFollow });
      await browser.storage.local.remove('webbFollowSuggestion');
      setFollowSuggestion(null);
      setMessage('Waiting for the Webb toolbar click on this tutorial tab.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Follow failed");
    }
  }
  function openMicrophonePermission() {
    void browser.tabs.create({ url: browser.runtime.getURL('/microphone.html') });
  }
  async function followCurrentTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    await followTab(tab || {});
  }
  async function followSuggestedTab() {
    if (!followSuggestion) return;
    const tab = await browser.tabs.get(followSuggestion.tabId).catch(() => null);
    if (!tab) { setFollowSuggestion(null); setMessage('The video tab is no longer open.'); return; }
    await followTab(tab);
  }
  async function stopFollow() {
    await browser.runtime.sendMessage({ type: "STOP_FOLLOW" }).catch(() => {});
    await browser.storage.local.remove('webbActiveFollow');
    await browser.storage.local.remove('webbFollowPhase');
    if (autoMode) {
      try {
        const memory = await loadSkillbook();
        if (memory.recent?.steps.length) {
          const skill = await saveRecentAsSkill(memory.recent.source?.title || 'Browser workflow');
          setMessage(`Saved ${skill.name} as a reusable skill.`);
        } else setMessage('No verified steps to save from this video.');
      } catch { setMessage('FOLLOW stopped. The skill could not be saved.'); }
    } else setMessage("Stopped following tutorial audio.");
    setFollowed(null);
    setLatestTutorialText('');
    coordinator.current?.setFollowedTab(null);
  }
  async function cancelFollowSetup() {
    await browser.storage.local.remove('webbPendingFollow');
    await browser.storage.local.remove('webbFollowPhase');
    setPendingFollow(null);
    setMessage('FOLLOW setup cancelled.');
  }
  async function saveSkill() {
    try {
      const saved = await saveRecentAsSkill(skillName || recentRun?.source?.title || 'Browser workflow');
      setMessage(`Saved ${saved.name}. Say "Run skill ${saved.name}" to use it later.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save skill.');
    }
  }
  async function removeSkill(id: string) {
    await deleteSkill(id);
    setMessage('Skill removed from this browser.');
  }
  async function changeAutoMode(enabled: boolean) {
    setAutoMode(enabled);
    await browser.storage.local.set({ webbAutoMode: enabled });
    setMessage(enabled ? 'Auto learn is on for the tutorials you follow.' : 'Auto learn is off. You can still save a skill yourself.');
  }
  async function useSkillValue() {
    try {
      await coordinator.current?.provideSkillValue(skillValue);
      setSkillValue('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not use that value.');
    }
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
    if (followedRef.current) await browser.runtime.sendMessage({ type: "STOP_FOLLOW" }).catch(() => {});
    setFollowed(null);
    coordinator.current?.setFollowedTab(null);
    let cloudSessionDeleted = true;
    try {
      await coordinator.current?.clearSession();
    } catch {
      cloudSessionDeleted = false;
    }
    await clearSkillbook();
    await browser.storage.local.remove(["privacyConsentVersion", "privacyConsentAt", "webbSessionId", "webbAutoMode", "webbFollowSuggestion", "webbActiveFollow", "webbPendingFollow", "webbFollowNotice"]);
    consentedRef.current = false;
    setConsented(false);
    setTabs([]);
    setTarget(null);
    setSnapshot(null);
    setAutoMode(false);
    setFollowSuggestion(null);
    setPendingFollow(null);
    setSkills([]);
    setRecentRun(null);
    setLastVideo(null);
    setMessage(cloudSessionDeleted
      ? "Webb stopped and session data was cleared."
      : "Webb stopped. Previously sent data will expire within 24 hours.");
  }

  const followedTitle =
    tabs.find((tab) => tab.id === followed)?.title ||
    (followed ? `Tab ${followed}` : pendingFollow?.source.title || "Choose a tutorial tab");
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
            <button className="text-button" onClick={inspect} disabled={!target || !consented}>
              <Icon name="refresh" size={14} /> Inspect target page {snapshot ? `· ${snapshot.elements.length} controls found` : ""}
            </button>
            <label className="auto-mode-row">
              <span><strong>Save verified steps</strong><small>Build a reusable skill after a successful FOLLOW session.</small></span>
              <input type="checkbox" checked={autoMode} onChange={event => void changeAutoMode(event.target.checked)} />
            </label>
            {consented && (
              <button className="privacy-reset" onClick={() => void withdrawPrivacyConsent()}>
                Withdraw consent and stop Webb
              </button>
            )}
          </section>
        )}
        {followSuggestion && consented && !followed && !pendingFollow && (
          <section className="video-suggestion" aria-label="Video ready to follow">
            <span className="eyebrow">VIDEO READY</span>
            <h2>{followSuggestion.source.title}</h2>
            <p>Webb can hear this tab, find actionable steps, and build a reusable skill from verified actions.</p>
            <button onClick={() => void followSuggestedTab()}>Follow this video <Icon name="arrow" size={15} /></button>
          </section>
        )}
        <section className="setup-section" aria-label="Choose tabs">
          <div className="section-heading">
            <h2>Follow a tutorial</h2>
          </div>
          <p className="section-intro">
            Play a tutorial in this tab. Webb listens and acts on the website you choose below.
          </p>
          <div className="target-control">
            <label htmlFor="target-tab">ACT ON THIS TAB</label>
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
                  .filter((tab) => tab.id !== followed && tab.id !== pendingFollow?.tabId)
                  .map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <button
            className={`follow-button ${followed ? "following" : ""}`}
            onClick={followed ? stopFollow : pendingFollow ? cancelFollowSetup : followCurrentTab}
            disabled={!consented}
          >
            <span className="button-icon">
              <Icon name={followed ? "stop" : "spark"} size={17} />
            </span>
            <span>
              {followed ? "Stop following" : pendingFollow ? "Cancel" : "Follow this tab"}
            </span>
            <Icon name="arrow" size={17} />
          </button>
          {pendingFollow && <p className="follow-instruction" role="status"><strong>{followPhase?.step === 'error' ? 'Could not connect' : followPhase?.step === 'toolbar' || followPhase?.step === 'capturing' ? 'Connecting audio' : 'Ready to listen'}</strong><br />{followPhase?.step === 'error' ? followPhase.detail : followPhase?.step === 'toolbar' || followPhase?.step === 'capturing' ? 'Webb received the toolbar click. Connecting to AssemblyAI...' : 'Click the blue Webb icon in Chrome’s top toolbar on the tutorial tab. The microphone button below is for TALK.'}</p>}
          {followed && latestTutorialText && <p className="follow-instruction" role="status"><strong>Just heard:</strong> {latestTutorialText}{!target && <><br />Choose a target website for browser actions.</>}</p>}
        </section>
        {(followed || target || pendingFollow) && <section className="connection-summary" aria-label="Browser connection">
          <div><span>LISTENING TO</span><strong title={followedTitle}>{followedTitle}</strong><small>{followed ? 'Connected' : pendingFollow ? 'Waiting to connect' : 'Choose a tutorial'}</small></div>
          <Icon name="arrow" size={15} />
          <div><span>ACTING ON</span><strong title={targetTitle}>{targetTitle}</strong><small>{target ? 'Selected' : 'Choose a tab above'}</small></div>
        </section>}
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
        {view.skill && (
          <section className="skill-run-card" aria-label="Running skill">
            <div className="section-heading"><h2>{view.skill.name}</h2><span>{view.skill.status.replace('_', ' ').toUpperCase()}</span></div>
            <p>{view.skill.status === 'needs_value'
              ? `Say the value for ${view.skill.fieldLabel}, or type it below. Webb does not reuse old form values.`
              : view.skill.status === 'complete'
                ? 'The learned workflow finished on this page.'
                : view.skill.status === 'failed'
                  ? 'Webb stopped because this page did not match a step reliably.'
                  : `Step ${Math.min(view.skill.index + 1, view.skill.total)} of ${view.skill.total}`}</p>
            {view.skill.status === 'needs_value' && (
              <div className="skill-value-row">
                <input aria-label={`Value for ${view.skill.fieldLabel}`} value={skillValue} onChange={event => setSkillValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void useSkillValue(); }} placeholder={`Value for ${view.skill.fieldLabel}`} />
                <button onClick={() => void useSkillValue()} disabled={!skillValue.trim()}>Use value</button>
              </div>
            )}
            {['running', 'needs_value', 'needs_confirmation'].includes(view.skill.status) && <button className="skill-stop" onClick={() => coordinator.current?.cancelSkill()}>Stop skill</button>}
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
        {(followed || view.procedure.steps.length > 0) && <section className="progress-section" aria-label="Procedure progress">
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
        </section>}
        {consented && (recentRun?.steps.length || skills.length) ? (
          <section className="skills-section" aria-label="Reusable skills">
            <div className="section-heading"><h2>Skills</h2><span>{skills.length} SAVED</span></div>
            <p className="section-intro">Webb remembers verified steps and matches them to the controls on your next page.</p>
            {lastVideo && <div className="last-video"><span>LAST VIDEO</span><a href={lastVideo.url} target="_blank" rel="noreferrer">{lastVideo.title}</a></div>}
            {recentRun && recentRun.steps.length > 0 && (
              <div className="recent-skill">
                <span className="eyebrow">READY TO SAVE</span>
                <strong>{recentRun.steps.length} verified {recentRun.steps.length === 1 ? 'step' : 'steps'}</strong>
                <p>Field values are left blank for the next run.</p>
                <div className="save-skill-row"><input aria-label="Name this skill" value={skillName} onChange={event => setSkillName(event.target.value)} placeholder="Name this skill" /><button onClick={() => void saveSkill()}>Save skill</button></div>
              </div>
            )}
            {skills.length ? <ul className="saved-skills">
              {skills.map(skill => <li key={skill.id}>
                <div><strong>{skill.name}</strong><small>{skill.steps.length} steps · {skill.targetHost || 'Any site'}</small></div>
                <button onClick={() => runSkill(skill)} disabled={!target}>Run</button>
                <button className="remove-skill" onClick={() => void removeSkill(skill.id)} aria-label={`Remove ${skill.name}`}>×</button>
              </li>)}
            </ul> : <p className="empty-note">Follow a tutorial, verify a few steps, then save the workflow.</p>}
          </section>
        ) : null}
        {(view.events.length > 0 || followed) && <section className="activity-section">
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
        </section>}
      </main>
      <footer className="command-dock">
        <div className="dock-status" role="status">
          <span
            className={`status-indicator ${view.busy ? "working" : micOn || followed ? "live" : ""}`}
          />
          {view.busy ? "Webb is working" : message}
        </div>
        {micPermissionIssue && <button className="mic-permission-button" onClick={openMicrophonePermission}>Enable microphone in Chrome</button>}
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
