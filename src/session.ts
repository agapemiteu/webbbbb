import { browser } from 'wxt/browser';
import type { BrowserAction, PageRequest, PageResponse, PageSnapshot, ProcedureState, TranscriptTurn } from './protocol';
import { beginManualRun, beginVideoRun, rememberVerifiedStep } from './skillbook';
import { stepFromVerifiedAction, stepInstruction, type SkillSource, type WebbSkill } from './skill-model';

type Plan = {
  kind: string;
  reason: string;
  confidence: number;
  goal: string;
  action?: BrowserAction;
};

function safeNavigationUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) return null;
    return url;
  } catch {
    return null;
  }
}

function isExplicitConfirmation(text: string, description: string): boolean {
  const match = text.trim().match(/^(yes|yeah|yep|okay|ok|go ahead|do it|proceed|confirm)(?:[, ]+(please|send it|submit it|publish it|deploy it|delete it|continue|do it|go ahead))?[.!\s]*$/i);
  if (!match) return false;
  const qualifier = match[2]?.toLowerCase();
  if (!qualifier || ['please', 'continue', 'do it', 'go ahead'].includes(qualifier)) return true;
  const actionWord = qualifier.split(' ')[0];
  return new RegExp(`\\b${actionWord}\\b`, 'i').test(description);
}

export type SessionView = {
  procedure: ProcedureState;
  pending: { action: BrowserAction; description: string; requestedAt: number } | null;
  events: string[];
  busy: boolean;
  current?: { heard: string; matched: string; source: TranscriptTurn['source']; state: 'mapping' | 'needs_you' | 'acting' | 'verified' | 'failed' };
  skill?: { name: string; index: number; total: number; status: 'running' | 'needs_value' | 'needs_confirmation' | 'complete' | 'failed' | 'cancelled'; fieldLabel?: string };
};

export class SessionCoordinator {
  view: SessionView = { procedure: { goal: '', steps: [] }, pending: null, events: [], busy: false };
  private generation = 0;
  private tutorialQueue: Promise<void> = Promise.resolve();
  private pendingGate: Promise<void> | null = null;
  private releasePending: (() => void) | null = null;
  private sessionId: string | null = null;
  private revision = 0;
  private syncQueue: Promise<void> = Promise.resolve();
  private activeSkill: { skill: WebbSkill; index: number } | null = null;

  constructor(private readonly apiBase: () => string, private readonly targetTab: () => number | null, private readonly onChange: (view: SessionView) => void) {}

  private update(patch: Partial<SessionView>) {
    this.view = { ...this.view, ...patch };
    this.onChange(this.view);
  }

  private log(message: string) {
    this.update({ events: [message, ...this.view.events].slice(0, 20) });
  }

  private async ensureSession() {
    if (this.sessionId) return;
    const saved = await browser.storage.local.get('webbSessionId');
    if (typeof saved.webbSessionId === 'string') {
      const response = await fetch(`${this.apiBase()}/session/${saved.webbSessionId}`, {
        headers: { 'X-Webb-Extension': browser.runtime.id },
      });
      if (response.ok) {
        const state = await response.json() as { revision: number };
        this.sessionId = saved.webbSessionId;
        this.revision = state.revision;
        return;
      }
    }
    const response = await fetch(`${this.apiBase()}/session`, { method: 'POST' });
    if (!response.ok) throw new Error(`Session service unavailable (${response.status})`);
    const created = await response.json() as { sessionId: string };
    this.sessionId = created.sessionId;
    this.revision = 0;
    await browser.storage.local.set({ webbSessionId: created.sessionId });
  }

  private persist(patch: Record<string, unknown>) {
    this.syncQueue = this.syncQueue.then(async () => {
      await this.ensureSession();
      const response = await fetch(`${this.apiBase()}/session/${this.sessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: this.revision, patch }),
      });
      if (!response.ok) throw new Error(`Session update failed (${response.status})`);
      const updated = await response.json() as { revision: number };
      this.revision = updated.revision;
    }).catch(() => { /* Local flow continues if the state service is unavailable. */ });
  }

  setFollowedTab(tabId: number | null) { this.persist({ mode: tabId ? 'follow' : 'idle' }); }
  setTalkActive(active: boolean) { this.persist({ mode: active ? 'talk' : 'idle', status: active ? 'listening' : 'idle' }); }
  startVideoMemory(source: SkillSource) { void beginVideoRun(source); }
  startManualMemory() { void beginManualRun(); }

  async clearSession() {
    this.generation++;
    this.activeSkill = null;
    this.clearGate();
    await this.syncQueue;
    let sessionId = this.sessionId;
    if (!sessionId) {
      const saved = await browser.storage.local.get('webbSessionId');
      if (typeof saved.webbSessionId === 'string') sessionId = saved.webbSessionId;
    }
    if (sessionId) {
      const response = await fetch(`${this.apiBase().replace(/\/$/, '')}/session/${sessionId}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error(`Could not delete the cloud session (${response.status})`);
    }
    this.sessionId = null;
    this.revision = 0;
    await browser.storage.local.remove('webbSessionId');
    this.update({ procedure: { goal: '', steps: [] }, pending: null, current: undefined, skill: undefined, events: [], busy: false });
  }

  private recordAction(actionId: string, success: boolean, observedState: string) {
    this.syncQueue = this.syncQueue.then(async () => {
      await this.ensureSession();
      const response = await fetch(`${this.apiBase()}/session/${this.sessionId}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: this.revision, action: { actionId, success, observedState, timestamp: Date.now() } }),
      });
      if (!response.ok) throw new Error(`Action event failed (${response.status})`);
      const updated = await response.json() as { revision: number };
      this.revision = updated.revision;
    }).catch(() => {});
  }

  async inspect(): Promise<PageSnapshot> {
    const tab = this.targetTab();
    if (!tab) throw new Error('Choose a target tab first.');
    let result: PageResponse;
    try {
      result = await browser.tabs.sendMessage(tab, { type: 'INSPECT' } satisfies PageRequest) as PageResponse;
    } catch {
      try {
        await browser.scripting.executeScript({ target: { tabId: tab }, files: ['/content-scripts/content.js'] });
        result = await browser.tabs.sendMessage(tab, { type: 'INSPECT' } satisfies PageRequest) as PageResponse;
      } catch {
        throw new Error('Webb cannot inspect this tab. Open or reload a normal website, then try again.');
      }
    }
    if (!result.ok) throw new Error(result.error);
    return result.snapshot;
  }

  startSkill(skill: WebbSkill) {
    if (!this.targetTab()) throw new Error('Choose the page where Webb should run the skill.');
    if (this.view.pending) throw new Error('Finish or cancel the pending action first.');
    if (!skill.steps.length) throw new Error('This skill has no verified steps.');
    this.generation++;
    this.clearGate();
    this.activeSkill = { skill, index: 0 };
    this.update({ skill: { name: skill.name, index: 0, total: skill.steps.length, status: 'running' } });
    this.log(`RUNNING SKILL: ${skill.name}`);
    void this.advanceSkill();
  }

  cancelSkill() {
    if (!this.activeSkill) return;
    this.generation++;
    this.activeSkill = null;
    if (this.view.pending) this.cancel();
    this.update({ skill: this.view.skill ? { ...this.view.skill, status: 'cancelled' } : undefined });
    this.log('Skill stopped by you.');
  }

  async provideSkillValue(rawValue: string) {
    const active = this.activeSkill;
    const step = active?.skill.steps[active.index];
    if (!active || step?.type !== 'fill' || this.view.skill?.status !== 'needs_value') return;
    const value = rawValue.trim();
    if (!value || value.length > 500) throw new Error('Give Webb a value under 500 characters.');
    this.update({ skill: { ...this.view.skill, status: 'running' } });
    this.generation++;
    await this.process({ source: 'user', text: stepInstruction(step, value), timestamp: Date.now(), final: true }, this.generation);
  }

  private async advanceSkill() {
    const active = this.activeSkill;
    if (!active) return;
    const step = active.skill.steps[active.index];
    if (!step) {
      this.activeSkill = null;
      this.update({ skill: { name: active.skill.name, index: active.index, total: active.skill.steps.length, status: 'complete' } });
      this.log(`SKILL COMPLETE: ${active.skill.name}`);
      return;
    }
    if (step.type === 'fill') {
      this.update({ skill: { name: active.skill.name, index: active.index, total: active.skill.steps.length, status: 'needs_value', fieldLabel: step.label } });
      this.log(`VALUE NEEDED: ${step.label}`);
      return;
    }
    this.update({ skill: { name: active.skill.name, index: active.index, total: active.skill.steps.length, status: 'running' } });
    await this.process({ source: 'user', text: stepInstruction(step), timestamp: Date.now(), final: true }, this.generation);
  }

  private finishSkillStep(type: BrowserAction['type']) {
    const active = this.activeSkill;
    if (!active || active.skill.steps[active.index]?.type !== type) return;
    active.index++;
    queueMicrotask(() => void this.advanceSkill());
  }

  private failSkill(reason: string) {
    const active = this.activeSkill;
    if (!active) return;
    this.activeSkill = null;
    this.update({ skill: { name: active.skill.name, index: active.index, total: active.skill.steps.length, status: 'failed' } });
    this.log(`SKILL PAUSED: ${reason}`);
  }

  receive(turn: TranscriptTurn) {
    if (!turn.final) return;
    if (turn.source === 'followed_tab' && this.activeSkill) return;
    if (turn.source === 'user' && this.activeSkill && this.view.skill?.status === 'needs_value') {
      if (/^(stop|cancel|skip)(?:\s+skill)?[.!\s]*$/i.test(turn.text.trim())) this.cancelSkill();
      else void this.provideSkillValue(turn.text).catch(error => this.log(error instanceof Error ? error.message : 'Value was not accepted.'));
      return;
    }
    if (turn.source === 'user' && this.activeSkill && this.view.pending
      && !isExplicitConfirmation(turn.text, this.view.pending.description)
      && !/\b(no|stop|don't|cancel|wait)\b/i.test(turn.text)) this.cancelSkill();
    if (turn.source === 'user' && this.activeSkill && !this.view.pending) this.cancelSkill();
    this.log(`${turn.source === 'user' ? 'YOU' : 'TUTORIAL'}: ${turn.text}`);
    this.persist({ [turn.source === 'user' ? 'latestUserTurn' : 'latestTutorialTurn']: turn, status: 'planning' });
    if (turn.source === 'user') {
      this.generation++;
      void this.process(turn, this.generation);
    } else {
      const generation = this.generation;
      this.tutorialQueue = this.tutorialQueue.then(async () => {
        if (this.pendingGate) await this.pendingGate;
        if (generation === this.generation) await this.process(turn, generation);
      }).catch(error => this.log(String(error)));
    }
  }

  private async process(turn: TranscriptTurn, generation: number) {
    const text = turn.text.trim();
    if (turn.source === 'user' && /^(?:wait[, ]+)?(?:skip\b|i(?:'ve| have)?\s+already\b|already\b)/i.test(text)
      && !/\b(?:don't|do not|not)\s+skip\b/i.test(text)) {
      const steps = [...this.view.procedure.steps];
      const current = [...steps].reverse().find(step => step.status === 'current' || step.status === 'failed');
      if (current) current.status = 'skipped';
      this.update({ procedure: { ...this.view.procedure, steps }, pending: null, current: undefined });
      this.persist({ procedure: this.view.procedure, pendingConfirmation: null, status: 'listening' });
      this.clearGate();
      this.log('Current step skipped by you.');
      return;
    }
    if (this.view.pending && turn.source === 'user') {
      if (isExplicitConfirmation(text, this.view.pending.description)) {
        const pending = this.view.pending;
        this.update({ pending: null });
        this.persist({ pendingConfirmation: null, status: 'acting' });
        this.clearGate();
        await this.execute(pending.action, true, `Confirmed by you: ${pending.description}`);
        return;
      }
      if (/\b(no|stop|don't|cancel|wait)\b/i.test(text)) {
        this.cancel();
        return;
      }
      this.update({ pending: null });
      this.persist({ pendingConfirmation: null, status: 'listening' });
      this.clearGate();
    }

    if (turn.source === 'user') this.clearGate();

    this.update({ busy: true });
    try {
      const page = await this.inspect();
      const context: PageSnapshot = {
        url: page.url,
        title: page.title,
        elements: page.elements.map(({ id, role, text, tag }) => ({ id, role, text, tag })),
      };
      this.persist({ pageContext: context });
      const response = await fetch(`${this.apiBase().replace(/\/$/, '')}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: turn.source, text, page: context, procedure: this.view.procedure }),
      });
      if (!response.ok) throw new Error(`Planner unavailable (${response.status})`);
      const plan = await response.json() as Plan;
      if (generation !== this.generation) return;
      if (plan.goal && !this.view.procedure.goal) {
        this.update({ procedure: { ...this.view.procedure, goal: plan.goal } });
        this.persist({ procedure: this.view.procedure });
      }
      if (plan.kind !== 'instruction' || !plan.action) {
        this.log(plan.reason || 'No browser action needed.');
        this.failSkill('No matching control was found.');
        return;
      }
      const action = plan.action;
      const expectedSkillStep = this.activeSkill?.skill.steps[this.activeSkill.index];
      if (expectedSkillStep && action.type !== expectedSkillStep.type) {
        this.failSkill('The page proposed a different action.');
        return;
      }
      if (action.type === 'navigate') {
        const destination = safeNavigationUrl(action.url);
        if (!destination || action.risk !== 'auto' || plan.confidence < 0.75) {
          this.log('Navigation target is invalid or uncertain. Action paused.');
          this.failSkill('Navigation was uncertain.');
          this.waitForUser();
          return;
        }
        const description = `Open ${destination.hostname}`;
        this.update({ current: { heard: text, matched: destination.href, source: turn.source, state: 'mapping' } });
        const steps = this.view.procedure.steps.map(step => step.status === 'current' ? { ...step, status: 'failed' as const } : step);
        steps.push({ id: action.id, instruction: description, status: 'current' });
        this.update({ procedure: { ...this.view.procedure, steps } });
        this.persist({ procedure: this.view.procedure });
        await this.execute(action, false, description);
        return;
      }
      const target = page.elements.find(element => element.id === action.target);
      if (!target || plan.confidence < 0.75 || !['click', 'fill'].includes(action.type)) {
        this.log('No reliable target found. Action paused.');
        this.failSkill('No reliable page match was found.');
        this.waitForUser();
        return;
      }
      const needsConfirmation = action.risk === 'confirm' || action.type === 'click' && /\b(deploy|publish|delete|submit|send|purchase|pay|revoke|save|create|confirm)\b/i.test(target.text);
      const description = `${action.type === 'fill' ? 'Fill' : 'Open'} ${target.text || target.id}`;
      this.update({ current: { heard: text, matched: target.text || target.id, source: turn.source, state: 'mapping' } });
      const steps = this.view.procedure.steps.map(step => step.status === 'current' ? { ...step, status: 'failed' as const } : step);
      steps.push({ id: action.id, instruction: description, status: 'current' });
      this.update({ procedure: { ...this.view.procedure, steps } });
      this.persist({ procedure: this.view.procedure });
      if (needsConfirmation) {
        this.update({ pending: { action: { ...action, risk: 'confirm' }, description, requestedAt: Date.now() } });
        this.update({ current: { heard: text, matched: target.text || target.id, source: turn.source, state: 'needs_you' } });
        this.persist({ pendingConfirmation: this.view.pending, status: 'needs_user' });
        if (this.view.skill) this.update({ skill: { ...this.view.skill, status: 'needs_confirmation' } });
        this.waitForUser();
        this.log(`NEEDS YOU: ${description}`);
        return;
      }
      await this.execute(action, false, description);
    } catch (error) {
      this.log(error instanceof Error ? error.message : 'Could not process speech.');
      this.failSkill('Planning failed.');
      this.waitForUser();
    } finally {
      this.update({ busy: false });
    }
  }

  async confirmFromButton() {
    const pending = this.view.pending;
    if (!pending) return;
    this.generation++;
    this.update({ pending: null });
    this.persist({ pendingConfirmation: null, status: 'acting' });
    this.clearGate();
    await this.execute(pending.action, true, `Confirmed by you: ${pending.description}`);
  }

  cancel() {
    this.generation++;
    if (this.activeSkill) {
      const active = this.activeSkill;
      this.activeSkill = null;
      this.update({ skill: { name: active.skill.name, index: active.index, total: active.skill.steps.length, status: 'cancelled' } });
    }
    const pending = this.view.pending;
    const steps = pending
      ? this.view.procedure.steps.map(step => step.id === pending.action.id ? { ...step, status: 'skipped' as const } : step)
      : this.view.procedure.steps;
    this.update({ pending: null, current: undefined, procedure: { ...this.view.procedure, steps } });
    this.persist({ pendingConfirmation: null, procedure: this.view.procedure, status: 'listening' });
    this.clearGate();
    this.log('Pending action cancelled by you.');
  }

  private clearGate() {
    this.releasePending?.();
    this.releasePending = null;
    this.pendingGate = null;
  }

  private waitForUser() {
    if (!this.pendingGate) {
      this.pendingGate = new Promise(resolve => { this.releasePending = resolve; });
    }
  }

  private failAction(action: BrowserAction, reason: string) {
    this.failSkill(reason);
    const steps = this.view.procedure.steps.map(step =>
      step.id === action.id ? { ...step, status: 'failed' as const } : step,
    );
    this.update({
      procedure: { ...this.view.procedure, steps },
      ...(this.view.current ? { current: { ...this.view.current, state: 'failed' as const } } : {}),
    });
    this.persist({ procedure: this.view.procedure, status: 'needs_user' });
    this.recordAction(action.id, false, reason);
    this.waitForUser();
  }

  private async execute(action: BrowserAction, confirmed: boolean, description: string) {
    const executionGeneration = this.generation;
    if (this.view.current) this.update({ current: { ...this.view.current, state: 'acting' } });
    const tab = this.targetTab();
    if (action.type === 'navigate') {
      const destination = safeNavigationUrl(action.url);
      if (!tab || !destination || action.risk !== 'auto') {
        this.failAction(action, 'Navigation destination or selected tab is invalid.');
        this.log('Navigation paused.');
        return;
      }
      try {
        await browser.tabs.update(tab, { url: destination.href });
        let finalUrl = '';
        for (let attempt = 0; attempt < 20; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 250));
          const current = await browser.tabs.get(tab);
          if (current.status === 'complete' && current.url) {
            finalUrl = current.url;
            break;
          }
        }
        if (finalUrl !== destination.href) {
          this.failAction(action, `Expected ${destination.href}, observed ${finalUrl || 'no completed URL'}.`);
          this.log('Navigation did not reach the requested URL. Action paused.');
          return;
        }
        const steps = this.view.procedure.steps.map(step => step.id === action.id ? { ...step, status: 'completed' as const } : step);
        this.update({ procedure: { ...this.view.procedure, steps }, ...(this.view.current ? { current: { ...this.view.current, state: 'verified' as const } } : {}) });
        this.persist({ procedure: this.view.procedure, status: 'listening' });
        this.recordAction(action.id, true, `Navigated to ${finalUrl}`);
        this.log(`VERIFIED: ${description}`);
      } catch (error) {
        this.failAction(action, error instanceof Error ? error.message : 'Navigation failed.');
        this.log('Navigation failed. Action paused.');
      }
      return;
    }
    if (!tab || !action.target) {
      this.failAction(action, 'Target tab or element is missing.');
      return;
    }
    let before: PageSnapshot;
    try { before = await this.inspect(); }
    catch {
      this.failAction(action, 'Could not inspect the target page.');
      this.log('Target page could not be inspected. Action paused.');
      return;
    }
    if (executionGeneration !== this.generation) return;
    const target = before.elements.find(element => element.id === action.target);
    if (!target) {
      this.failAction(action, 'Page changed before the action.');
      this.log('Page changed. Action paused.');
      return;
    }
    if (confirmed && action.targetText !== undefined && action.targetText !== target.text) {
      this.failAction(action, 'The confirmed control changed. Inspect the page and confirm again.');
      this.log('The page changed while Webb was waiting. Nothing was clicked.');
      return;
    }
    const request: PageRequest = action.type === 'fill'
      ? { type: 'FILL', id: action.target, value: action.value || '' }
      : { type: 'CLICK', id: action.target, confirmed };
    let result: PageResponse | null = null;
    try { result = await browser.tabs.sendMessage(tab, request) as PageResponse; }
    catch { /* Navigation can tear down the content script before it replies. */ }
    if (result && !result.ok) {
      this.failAction(action, result.error);
      this.log(`ACTION FAILED: ${result.error}`);
      return;
    }
    let verified = false;
    for (let attempt = 0; attempt < 8 && !verified; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      try {
        const after = await this.inspect();
        if (action.type === 'fill') verified = after.elements.find(element => element.id === action.target)?.value === action.value;
        else verified = after.url !== before.url || after.title !== before.title || JSON.stringify(after.elements) !== JSON.stringify(before.elements);
      } catch { /* Navigation may briefly replace the content script. */ }
    }
    if (!verified) {
      this.failAction(action, 'Expected page change not observed');
      this.log(`ACTION NEEDS CHECK: ${description}`);
      return;
    }
    const steps = this.view.procedure.steps.map(step => step.id === action.id ? { ...step, status: 'completed' as const } : step);
    this.update({ procedure: { ...this.view.procedure, steps } });
    if (this.view.current) this.update({ current: { ...this.view.current, state: 'verified' } });
    this.persist({ procedure: this.view.procedure, status: 'listening' });
    this.recordAction(action.id, true, description);
    this.log(`VERIFIED: ${description}`);
    if (!this.activeSkill) {
      const learned = stepFromVerifiedAction(action.type, target.role, target.text);
      if (learned) void rememberVerifiedStep(learned, before.url);
    }
    this.finishSkillStep(action.type);
  }
}
