import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { SessionCoordinator, type SessionView } from "../../src/session";
import { pointerCommand } from '../../src/pointer-command';
import { Transcriber } from "../../src/transcriber";
import type { PageSnapshot, TranscriptTurn } from "../../src/protocol";
import { beginVideoRun, clearSkillbook, deleteSkill, loadSkillbook, saveRecentAsSkill, SKILLS_KEY, RECENT_RUN_KEY, LAST_VIDEO_KEY } from "../../src/skillbook";
import { requestedSkill, videoSource, type RecentRun, type SkillSource, type WebbSkill } from "../../src/skill-model";
import { targetForFollow } from "../../src/follow-target";
import "./style.css";

type TabOption = { id: number; title: string; url: string };
type FollowSuggestion = { tabId: number; source: SkillSource; createdAt: number };
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
  const [followStarting, setFollowStarting] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micStarting, setMicStarting] = useState(false);
  const [micPermissionIssue, setMicPermissionIssue] = useState(false);
  const [partial, setPartial] = useState("");
  const [latestTutorialText, setLatestTutorialText] = useState("");
  const [followMode, setFollowMode] = useState<'actions' | 'notes'>('notes');
  const [sourceNotes, setSourceNotes] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  const [message, setMessage] = useState(
    "Choose a target website to get started.",
  );
  const [draft, setDraft] = useState("");
  const [spokenReplies, setSpokenReplies] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [reply, setReply] = useState("");
  const spokenRepliesRef = useRef(true);
  const speechGeneration = useRef(0);
  const speakingRef = useRef(false);
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [consented, setConsented] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [skills, setSkills] = useState<WebbSkill[]>([]);
  const [recentRun, setRecentRun] = useState<RecentRun | null>(null);
  const [lastVideo, setLastVideo] = useState<SkillSource | null>(null);
  const [followSuggestion, setFollowSuggestion] = useState<FollowSuggestion | null>(null);
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
  const followModeRef = useRef(followMode);
  const sourceNotesRef = useRef(sourceNotes);
  const consentedRef = useRef(consented);
  const skillsRef = useRef(skills);
  const viewRef = useRef(view);
  const microphone = useRef<Transcriber | null>(null);
  const micStartingRef = useRef(false);
  const followedAudio = useRef<Transcriber | null>(null);
  const followStartingRef = useRef(false);
  const sourceDetailsRef = useRef<SkillSource | null>(null);
  const coordinator = useRef<SessionCoordinator | null>(null);
  apiRef.current = apiBase;
  targetRef.current = target;
  followedRef.current = followed;
  followModeRef.current = followMode;
  sourceNotesRef.current = sourceNotes;
  consentedRef.current = consented;
  skillsRef.current = skills;
  viewRef.current = view;
  if (!coordinator.current)
    coordinator.current = new SessionCoordinator(
      () => apiRef.current,
      () => targetRef.current,
      setView,
      respond,
    );

  function stopReply() {
    speechGeneration.current++;
    if (speechTimer.current) clearTimeout(speechTimer.current);
    speechTimer.current = null;
    void browser.tts.stop();
    microphone.current?.setMuted(false);
    speakingRef.current = false;
    setSpeaking(false);
  }

  function respond(text: string) {
    stopReply();
    setReply(text);
    setMessage(text);
    if (!spokenRepliesRef.current || !consentedRef.current) return;
    const generation = speechGeneration.current;
    const finish = () => {
      if (generation !== speechGeneration.current) return;
      if (speechTimer.current) clearTimeout(speechTimer.current);
      speechTimer.current = setTimeout(() => {
        if (generation !== speechGeneration.current) return;
        microphone.current?.setMuted(false);
        speakingRef.current = false;
        setSpeaking(false);
      }, 500);
    };
    microphone.current?.setMuted(true);
    speakingRef.current = true;
    setSpeaking(true);
    speechTimer.current = setTimeout(() => { void browser.tts.stop(); finish(); }, 45000);
    void browser.tts.speak(text.slice(0, 600), {
      lang: 'en-US', requiredEventTypes: ['end'],
      onEvent: event => {
        if (['end', 'interrupted', 'cancelled', 'error'].includes(event.type)) {
          if (event.type === 'error') setMessage(`${text} Voice playback unavailable. You can read the reply here.`);
          finish();
        }
      },
    }).catch(() => { setMessage(`${text} Voice playback unavailable. You can read the reply here.`); finish(); });
  }

  async function refreshTabs() {
    if (!consentedRef.current) return;
    const found = await browser.tabs.query({ currentWindow: true });
    setTabs(
      found
        .filter((tab) => tab.id && tab.url?.startsWith("http"))
        .map((tab) => ({
          id: tab.id!,
          title: tab.title || tab.url || "Untitled tab",
          url: tab.url || '',
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
    void browser.storage.local.remove(['webbActiveFollow', 'webbPendingFollow', 'webbFollowNotice', 'webbFollowPhase']);
    browser.storage.local.get(["apiBase", "privacyConsentVersion", "webbAutoMode", "webbFollowSuggestion", "webbFollowMode", "webbSourceNotesV1", "webbSpokenReplies"]).then((saved) => {
      if (typeof saved.apiBase === "string" && saved.apiBase !== "http://localhost:8787") setApiBase(saved.apiBase);
      if (saved.privacyConsentVersion === "1") {
        consentedRef.current = true;
        setConsented(true);
        void refreshTabs();
      }
      if (saved.webbAutoMode === true) setAutoMode(true);
      if (saved.webbFollowMode === 'actions') setFollowMode('actions');
      if (saved.webbSpokenReplies === false) { spokenRepliesRef.current = false; setSpokenReplies(false); }
      if (Array.isArray(saved.webbSourceNotesV1)) setSourceNotes(saved.webbSourceNotesV1.filter((line): line is string => typeof line === 'string').slice(-100));
      const suggestion = saved.webbFollowSuggestion as FollowSuggestion | undefined;
      if (suggestion?.tabId && suggestion.source && Date.now() - suggestion.createdAt < 10 * 60_000) setFollowSuggestion(suggestion);
    });
    void refreshSkills();
    const activated = ({ tabId }: { tabId: number }) => {
      if (!consentedRef.current) return;
      void refreshTabs();
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
      if ('webbMicPermissionGrantedAt' in changes) {
        setMicPermissionIssue(false);
        setMessage('Microphone access is ready. Press the mic to talk to Webb.');
      }
    };
    browser.tabs.onActivated.addListener(activated);
    browser.tabs.onUpdated.addListener(refreshTabs);
    browser.storage.onChanged.addListener(onStorageChanged);
    return () => {
      browser.tabs.onActivated.removeListener(activated);
      browser.tabs.onUpdated.removeListener(refreshTabs);
      browser.storage.onChanged.removeListener(onStorageChanged);
      stopReply();
      void microphone.current?.stop();
      void followedAudio.current?.stop();
      void browser.storage.local.remove('webbActiveFollow');
    };
  }, []);

  function handleTurn(turn: TranscriptTurn) {
    if (turn.source === 'user' && speakingRef.current) return;
    if (!turn.final) {
      if (turn.source === 'user' && /^(stop|there)[.! ]*$/i.test(turn.text.trim())) void coordinator.current?.drivePointer({ kind: 'stop' }).catch(() => {});
      setPartial(
        `${turn.source === "user" ? "YOU" : "SOURCE"}: ${turn.text}`,
      );
      return;
    }
    setPartial("");
    if (turn.source === 'followed_tab') {
      setLatestTutorialText(turn.text);
      coordinator.current?.observeSource(sourceDetailsRef.current?.title || 'Source', turn.text);
      if (followModeRef.current === 'notes') {
        const next = [...sourceNotesRef.current, turn.text].slice(-100);
        sourceNotesRef.current = next;
        setSourceNotes(next);
        void browser.storage.local.set({ webbSourceNotesV1: next });
        return;
      }
      if (!targetRef.current || targetRef.current === followedRef.current) {
        setMessage('Source audio is working. Choose a different target website before Webb acts.');
        return;
      }
    }
    if (turn.source === 'user' && viewRef.current.skill?.status !== 'needs_value') {
      const pointer = pointerCommand(turn.text);
      if (pointer && !(viewRef.current.pending && pointer.kind !== 'stop')) {
        void coordinator.current?.drivePointer(pointer).then(detail => setMessage(detail)).catch(error => setMessage(error instanceof Error ? error.message : 'Pointer action failed.'));
        return;
      }
      if (/^(?:what(?:'s| is) playing|what (?:are you|is webb) listening to|which source)[?.!\s]*$/i.test(turn.text.trim())) {
        respond(followedAudio.current && sourceDetailsRef.current
          ? `Listening to ${sourceDetailsRef.current.title}.`
          : 'Source audio is not connected. Select Start listening and share the source tab with audio.');
        return;
      }
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
    stopReply();
    if (!consented || micStartingRef.current) return;
    micStartingRef.current = true;
    setMicStarting(true);
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
      const transcriber = new Transcriber("user", handleTurn, detail => {
        void microphone.current?.stop();
        microphone.current = null;
        setMicOn(false);
        coordinator.current?.setTalkActive(false);
        setMessage(detail);
      });
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
    } finally {
      micStartingRef.current = false;
      setMicStarting(false);
    }
  }
  async function followTab(tab: { id?: number; url?: string; title?: string }) {
    if (!consented || followStartingRef.current || followedAudio.current) return;
    followStartingRef.current = true;
    setFollowStarting(true);
    try {
      if (!tab?.id || !tab.url?.startsWith("http"))
        throw new Error("Open the source tab first.");
      const [active] = await browser.tabs.query({ active: true, currentWindow: true });
      if (active?.id !== tab.id) throw new Error('Open the source tab before starting.');
      const safeTarget = targetForFollow(targetRef.current, tab.id);
      if (safeTarget !== targetRef.current) { targetRef.current = safeTarget; setTarget(safeTarget); setSnapshot(null); }
      const source = videoSource(tab.title || 'Source tab', tab.url);
      if (!source) throw new Error('This tab cannot be followed. Choose a website with audio.');
      setLatestTutorialText('');
      setMessage('Choose this source tab in Chrome and turn on Share tab audio.');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: { suppressLocalAudioPlayback: false },
        video: { displaySurface: 'browser' },
        systemAudio: 'exclude',
      } as DisplayMediaStreamOptions);
      const surface = stream.getVideoTracks()[0]?.getSettings().displaySurface;
      if (surface && surface !== 'browser') {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('Choose a Chrome tab, then turn on Share tab audio.');
      }
      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('Tab audio was not shared. Try again and enable Share tab audio.');
      }
      setMessage('Connecting source audio to AssemblyAI...');
      const transcriber = new Transcriber('followed_tab', handleTurn, detail => {
        void stopFollow().then(() => setMessage(detail));
      });
      followedAudio.current = transcriber;
      try { await transcriber.start(stream, apiRef.current); }
      catch (error) {
        await transcriber.stop();
        followedAudio.current = null;
        throw error;
      }
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { void stopFollow(); }, { once: true });
      stream.getAudioTracks()[0]?.addEventListener('ended', () => { void stopFollow(); }, { once: true });
      if (followModeRef.current === 'notes') { sourceNotesRef.current = []; setSourceNotes([]); void browser.storage.local.set({ webbSourceNotesV1: [] }); }
      await beginVideoRun(source);
      await browser.storage.local.set({ webbActiveFollow: tab.id });
      setFollowed(tab.id);
      coordinator.current?.setFollowedTab(tab.id);
      coordinator.current?.resetSource();
      sourceDetailsRef.current = source;
      setMessage('Source connected. Play it to hear speech in Webb.');
    } catch (error) {
      await followedAudio.current?.stop();
      followedAudio.current = null;
      setFollowed(null);
      await browser.storage.local.remove('webbActiveFollow');
      const detail = error instanceof Error ? error.message : 'Follow failed';
      setMessage(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Tab audio was not shared. Select Start listening, choose Chrome Tab, and enable Share tab audio.'
        : detail);
    } finally {
      followStartingRef.current = false;
      setFollowStarting(false);
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
    if (!tab) { setFollowSuggestion(null); setMessage('The source tab is no longer open.'); return; }
    await followTab(tab);
  }
  async function copySourceNotes() {
    try {
      await navigator.clipboard.writeText(sourceNotes.join('\n\n'));
      setMessage('Notes copied. Paste them into Google Docs or another editor.');
    } catch {
      setMessage('Chrome could not copy the notes. Select the text in Webb and copy it.');
    }
  }
  async function stopFollow() {
    const capture = followedAudio.current;
    if (!capture) return;
    followedAudio.current = null;
    await capture.stop();
    sourceDetailsRef.current = null;
    await browser.storage.local.remove('webbActiveFollow');
    if (followModeRef.current === 'notes') {
      setMessage('Stopped listening. Notes remain in Webb for copying.');
    } else if (autoMode) {
      try {
        const memory = await loadSkillbook();
        if (memory.recent?.steps.length) {
          const skill = await saveRecentAsSkill(memory.recent.source?.title || 'Browser workflow');
          setMessage(`Saved ${skill.name} as a reusable skill.`);
        } else setMessage('No verified actions were found to save.');
      } catch { setMessage('FOLLOW stopped. The skill could not be saved.'); }
    } else setMessage('Stopped listening to source audio.');
    setFollowed(null);
    setLatestTutorialText('');
    coordinator.current?.setFollowedTab(null);
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
    setMessage(enabled ? 'Verified actions will be saved as a skill.' : 'Automatic skill saving is off. You can still save one yourself.');
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
    stopReply();
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
    stopReply();
    setReply("");
    await microphone.current?.stop();
    microphone.current = null;
    setMicOn(false);
    await followedAudio.current?.stop();
    followedAudio.current = null;
    setFollowed(null);
    coordinator.current?.setFollowedTab(null);
    let cloudSessionDeleted = true;
    try {
      await coordinator.current?.clearSession();
    } catch {
      cloudSessionDeleted = false;
    }
    await clearSkillbook();
    await browser.storage.local.remove(["privacyConsentVersion", "privacyConsentAt", "webbSessionId", "webbAutoMode", "webbFollowSuggestion", "webbActiveFollow", "webbPendingFollow", "webbFollowNotice", "webbSourceNotesV1", "webbFollowMode"]);
    consentedRef.current = false;
    setConsented(false);
    setTabs([]);
    setTarget(null);
    setSnapshot(null);
    setAutoMode(false);
    setFollowSuggestion(null);
    setSkills([]);
    setRecentRun(null);
    setLastVideo(null);
    setSourceNotes([]);
    setFollowMode('notes');
    setMessage(cloudSessionDeleted
      ? "Webb stopped and session data was cleared."
      : "Webb stopped. Previously sent data will expire within 24 hours.");
  }

  const followedTitle =
    tabs.find((tab) => tab.id === followed)?.title ||
    (followed ? `Tab ${followed}` : "Choose a source tab");
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
              When you start TALK or FOLLOW, Webb sends your chosen microphone or source-tab audio to AssemblyAI for transcription. In action mode it sends speech and visible controls from the selected page to Webb's Worker and Groq. Listen and assist stores the transcript in this browser. When you ask a question or request an action, recent source speech is sent to the Worker and Groq as context. Spoken replies use Chrome speech synthesis. Action progress is kept in a temporary Cloudflare session for up to 24 hours after your last activity.
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
            <label className="auto-mode-row"><span><strong>Spoken replies</strong><small>Webb answers aloud. Your mic pauses during replies to prevent echoes.</small></span><input type="checkbox" checked={spokenReplies} onChange={event => { const enabled = event.target.checked; spokenRepliesRef.current = enabled; setSpokenReplies(enabled); if (!enabled) stopReply(); void browser.storage.local.set({ webbSpokenReplies: enabled }); }} /></label>
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
        {followSuggestion && consented && !followed && (
          <section className="video-suggestion" aria-label="Video ready to follow">
            <span className="eyebrow">SOURCE READY</span>
            <h2>{followSuggestion.source.title}</h2>
            <p>Webb can listen to this source and either act on instructions or capture notes.</p>
            <button onClick={() => void followSuggestedTab()}>Listen to this source <Icon name="arrow" size={15} /></button>
          </section>
        )}
      {reply && <section className="source-notes" aria-label="Webb reply"><strong>Webb</strong><p>{reply}</p>{speaking && <button type="button" onClick={stopReply}>Stop speaking and listen to me</button>}</section>}
        <section className="setup-section" aria-label="Choose tabs">
          <div className="section-heading">
            <h2>Listen to a source</h2>
          </div>
          <p className="section-intro">
            Watch or listen normally. Share any audio tab so Webb can understand the context. Use the mic to ask questions or request actions on a website.
          </p>
          <p className="section-intro">You can also use TALK without sharing a source. Select a target website and press the mic.</p>
          <div className="source-mode" role="group" aria-label="What Webb should do with source audio">
            <button type="button" aria-pressed={followMode === 'actions'} className={followMode === 'actions' ? 'selected' : ''} disabled={!!followed || followStarting} onClick={() => { setFollowMode('actions'); void browser.storage.local.set({ webbFollowMode: 'actions' }); }}>Act on instructions<small>Use spoken steps on another tab</small></button>
            <button type="button" aria-pressed={followMode === 'notes'} className={followMode === 'notes' ? 'selected' : ''} disabled={!!followed || followStarting} onClick={() => { setFollowMode('notes'); void browser.storage.local.set({ webbFollowMode: 'notes' }); }}>Listen and assist<small>Keep context. Act only when you ask.</small></button>
          </div>
          <div className="target-control">
            <label htmlFor="target-tab">{followMode === 'actions' ? 'ACT ON THIS TAB' : 'TARGET FOR YOUR COMMANDS (OPTIONAL)'}</label>
            <div className="select-wrap">
              <select
                id="target-tab"
                value={target || ""}
                disabled={!consented || followStarting}
                onChange={(event) => {
                  const id = Number(event.target.value) || null;
                  if (view.busy || view.pending) coordinator.current?.cancel();
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
          {tabs.find(tab => tab.id === target)?.url.startsWith('https://docs.google.com/document/') && <p className="section-intro">Ask Webb to append text or rename this document. Document input uses Chrome keyboard control and shows a temporary browser notice. Webb checks the inserted text and stops if it cannot verify it.</p>}
          <button
            className={`follow-button ${followed ? "following" : ""}`}
            onClick={followed ? stopFollow : followCurrentTab}
            disabled={!consented || followStarting}
          >
            <span className="button-icon">
              <Icon name={followed ? "stop" : "spark"} size={17} />
            </span>
            <span>
              {followed ? "Stop listening" : followStarting ? "Connecting..." : "Start listening"}
            </span>
            <Icon name="arrow" size={17} />
          </button>
          {followed && latestTutorialText && <p className="follow-instruction" role="status"><strong>Just heard:</strong> {latestTutorialText}{followMode === 'actions' && !target && <><br />Choose a target website for browser actions.</>}</p>}
        </section>
        {(followed || (followMode === 'actions' && target)) && <section className="connection-summary" aria-label="Browser connection">
          <div><span>LISTENING TO</span><strong title={followedTitle}>{followedTitle}</strong><small>{followed ? 'Connected' : 'Choose a source'}</small></div>
          <Icon name="arrow" size={15} />
          <div><span>{followMode === 'notes' ? 'READY TO ASSIST' : 'ACTING ON'}</span><strong title={followMode === 'notes' ? (target ? targetTitle : 'Ask Webb anytime') : targetTitle}>{followMode === 'notes' ? (target ? targetTitle : 'Ask Webb anytime') : targetTitle}</strong><small>{followMode === 'notes' ? 'Waiting for your request' : target ? 'Selected' : 'Choose a tab above'}</small></div>
        </section>}
        {followMode === 'notes' && sourceNotes.length > 0 && <section className="source-notes" aria-label="Captured notes"><div className="section-heading"><h2>Source transcript</h2><span>{sourceNotes.length} {sourceNotes.length === 1 ? 'LINE' : 'LINES'}</span></div><div className="source-notes-text">{sourceNotes.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}</div><button type="button" onClick={() => void copySourceNotes()}>Copy transcript</button></section>}
        {view.pending && (
          <section className="decision-card" aria-label="Confirmation required">
            <div className="decision-label">
              <span className="alert-dot" /> NEEDS YOU
            </div>
            <h2>{view.pending.description}</h2>
            {view.pending.preview && <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 180, overflow: "auto" }}>{view.pending.preview}</pre>}
            <p>
              This action requires your approval. Source audio cannot approve
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
                    {current.source === "user" ? "YOU SAID" : "SOURCE SAYS"}
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
        {((followMode === 'actions' && followed) || view.procedure.steps.length > 0) && <section className="progress-section" aria-label="Procedure progress">
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
            {lastVideo && <div className="last-video"><span>LAST SOURCE</span><a href={lastVideo.url} target="_blank" rel="noreferrer">{lastVideo.title}</a></div>}
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
            </ul> : <p className="empty-note">Follow a source with actionable steps, verify them, then save the workflow.</p>}
          </section>
        ) : null}
        {(view.events.length > 0 || (followMode === 'actions' && followed)) && <section className="activity-section">
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
            disabled={!consented || micStarting}
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
        <p className="dock-hint">Your instructions always take priority. Steer with move right, a little up, stop, and click.</p>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
