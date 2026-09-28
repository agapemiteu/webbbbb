import { browser } from 'wxt/browser';
import { appendToGoogleDoc } from './docs-input';
import { commitGmailRecipient } from './mail-input';
import type { PointerCommand } from './pointer-command';
import type { BrowserAction, PageRequest, PageResponse, PageSnapshot, ProcedureState, TranscriptTurn } from './protocol';
import { beginManualRun, beginVideoRun, rememberVerifiedStep } from './skillbook';
import { stepFromVerifiedAction, stepInstruction, type SkillSource, type WebbSkill } from './skill-model';

type Plan = {
  kind: string;
  reason: string;
  confidence: number;
  goal: string;
  continueTask?: boolean;
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
  pending: { action: BrowserAction; description: string; requestedAt: number; preview?: string } | null;
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
  private task: { turn: TranscriptTurn; progress: string[]; continueTask: boolean } | null = null;
  private confirmationPage: { tabId: number; fields: string } | null = null;
  private sourceContext: { title: string; transcript: string } | undefined;
  private activeSkill: { skill: WebbSkill; index: number } | null = null;

  constructor(private readonly apiBase: () => string, private readonly targetTab: () => number | null, private readonly onChange: (view: SessionView) => void, private readonly onReply: (text: string) => void = () => {}) {}

  private update(patch: Partial<SessionView>) {
    if (patch.procedure) patch.procedure = { ...patch.procedure, steps: patch.procedure.steps.slice(-30) };
    this.view = { ...this.view, ...patch };
    this.onChange(this.view);
  }

  private log(message: string) {
    this.update({ events: [message, ...this.view.events].slice(0, 20) });
  }

  observeSource(title: string, text: string) {
    const previous = this.sourceContext?.title === title ? this.sourceContext.transcript : '';
    this.sourceContext = { title: title.slice(0, 300), transcript: `${previous}\n${text}`.trim().slice(-8000) };
  }

  resetSource() { this.sourceContext = undefined; }

  private fieldsFingerprint(page: PageSnapshot) {
    return JSON.stringify({ url: page.url, recipients: page.draftRecipients, attachments: page.elements.filter(element => /attachment/i.test(element.text)).map(element => [element.id, element.text]), fields: page.elements.filter(element => element.value !== undefined).map(element => [element.id, element.value]) });
  }

  private async continueTask(action: BrowserAction, description: string, generation: number) {
    if (generation !== this.generation || !this.task) return;
    if (!this.view.procedure.steps.some(step => step.id === action.id && step.status === 'completed')) { this.task = null; return; }
    this.task.progress.push(`${description}${action.value !== undefined ? `: ${action.value}` : ''}`);
    if (!this.task.continueTask) { this.task = null; return; }
    if (this.task.progress.length >= 8) {
      this.task = null;
      this.onReply('Eight steps completed. Review the page and tell me what to do next.');
      return;
    }
    await this.process(this.task.turn, generation);
  }

  private verifiedReply(description: string) {
    if (!this.task?.continueTask) this.onReply(`Done. ${description}.`);
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
    this.resetSource();
    this.task = null;
    this.confirmationPage = null;
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
    this.task = null;
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

  async drivePointer(command: PointerCommand) {
    const tab = this.targetTab();
    if (!tab) throw new Error('Choose the website where Webb should move.');
    if (command.kind === 'stop') this.cancel();
    else await browser.tabs.update(tab, { active: true });
    await this.inspect();
    const result = await browser.tabs.sendMessage(tab, { type: 'POINTER', command } satisfies PageRequest) as PageResponse;
    if (!result.ok) throw new Error(result.error);
    if (command.kind !== 'click') return result.detail;
    this.generation++;
    this.task = null;
    if (this.view.pending) this.cancel();
    const target = result.snapshot.elements.find(element => element.id === result.pointerTarget);
    if (!target) throw new Error('No visible control is under Webb. Move onto a button, link, or field.');
    const safe = target.role === 'link' || ['textbox', 'combobox', 'tab', 'menuitem'].includes(target.role)
      || /^(settings|connections|integrations|overview|menu|compose)$/i.test(target.text.trim());
    const risky = /\b(send|submit|delete|remove|publish|deploy|save|create|pay|purchase|confirm|revoke)\b/i.test(target.text);
    const action: BrowserAction = { id: crypto.randomUUID(), type: 'click', target: target.id, targetText: target.text, risk: safe && !risky ? 'auto' : 'confirm' };
    const description = `Click ${target.text || 'this control'}`;
    this.update({ procedure: { ...this.view.procedure, steps: [...this.view.procedure.steps, { id: action.id, instruction: description, status: 'current' }] }, current: { heard: 'Click here', matched: target.text, source: 'user', state: action.risk === 'confirm' ? 'needs_you' : 'mapping' } });
    if (action.risk === 'confirm') {
      this.confirmationPage = { tabId: tab, fields: this.fieldsFingerprint(result.snapshot) };
      this.update({ pending: { action, description, requestedAt: Date.now() } });
      this.waitForUser();
      this.onReply(`${description}. Say go ahead to approve, or cancel.`);
    } else await this.execute(action, false, description);
    return description;
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
    this.log(`${turn.source === 'user' ? 'YOU' : 'SOURCE'}: ${turn.text}`);
    this.persist({ [turn.source === 'user' ? 'latestUserTurn' : 'latestTutorialTurn']: turn, status: 'planning' });
    if (turn.source === 'user') {
      if (!this.view.pending || !isExplicitConfirmation(turn.text, this.view.pending.description)) {
        this.task = this.activeSkill ? null : { turn, progress: [], continueTask: false };
      }
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
        await this.continueTask(pending.action, pending.description, generation);
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
      const page = this.targetTab() ? await this.inspect() : {
        url: 'https://webb-five-puce.vercel.app/', title: 'No target selected', elements: [],
      };
      const context: PageSnapshot = {
        url: page.url,
        title: page.title,
        elements: page.elements.map(({ id, role, text, tag, options, value }) => ({ id, role, text, tag, ...(options ? { options } : {}), ...(value !== undefined ? { filled: !!value.trim() } : {}) })),
      };
      this.persist({ pageContext: context });
      const planRequest = () => fetch(`${this.apiBase().replace(/\/$/, '')}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: turn.source, text, page: context, procedure: this.view.procedure, ...(turn.source === 'user' ? { sourceContext: this.sourceContext, taskProgress: this.task?.progress || [] } : {}) }),
      });
      let response = await planRequest();
      if (response.status === 429) {
        const error = await response.json() as { retryAfter?: number };
        const seconds = Math.min(30, Math.max(1, error.retryAfter || 5));
        this.log(`Planner is busy. Retrying the next step in ${seconds} seconds.`);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        if (generation !== this.generation) return;
        response = await planRequest();
      }
      if (!response.ok) throw new Error(response.status === 429 ? 'Planner is still busy. Your verified steps are preserved. Tell me the next step when ready.' : `Planner unavailable (${response.status})`);
      const plan = await response.json() as Plan;
      if (generation !== this.generation) return;
      if (plan.goal && !this.view.procedure.goal) {
        this.update({ procedure: { ...this.view.procedure, goal: plan.goal } });
        this.persist({ procedure: this.view.procedure });
      }
      if (plan.kind !== 'instruction' || !plan.action) {
        this.log(plan.reason || 'No browser action needed.');
        if (turn.source === 'user') this.onReply(plan.reason || 'No browser action is needed.');
        this.failSkill('No matching control was found.');
        return;
      }
      if (!this.targetTab()) { this.onReply('Choose a target website for this action.'); return; }
      const action = plan.action;
      if (turn.source === 'user' && this.task) this.task.continueTask = plan.continueTask === true;
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
        await this.continueTask(action, description, generation);
        return;
      }
      const target = page.elements.find(element => element.id === action.target);
      if (!target || plan.confidence < 0.75 || !['click', 'fill', 'append'].includes(action.type)) {
        this.log('No reliable target found. Action paused.');
        this.failSkill('No reliable page match was found.');
        this.waitForUser();
        return;
      }
      const needsConfirmation = action.risk === 'confirm' || action.type === 'click' && /\b(deploy|publish|delete|submit|send|purchase|pay|revoke|save|create|confirm)\b/i.test(target.text);
      const description = `${action.type === 'fill' ? 'Fill' : action.type === 'append' ? 'Append text to' : 'Click'} ${target.text || target.id}`;
      this.update({ current: { heard: text, matched: target.text || target.id, source: turn.source, state: 'mapping' } });
      const steps = this.view.procedure.steps.map(step => step.status === 'current' ? { ...step, status: 'failed' as const } : step);
      steps.push({ id: action.id, instruction: description, status: 'current' });
      this.update({ procedure: { ...this.view.procedure, steps } });
      this.persist({ procedure: this.view.procedure });
      if (needsConfirmation) {
        await browser.tabs.sendMessage(this.targetTab()!, { type: 'POINT_AT', id: target.id } satisfies PageRequest);
        if (generation !== this.generation) return;
        this.confirmationPage = { tabId: this.targetTab()!, fields: this.fieldsFingerprint(page) };
        this.update({ pending: { action: { ...action, risk: 'confirm' }, description, requestedAt: Date.now(), preview: [...(page.draftRecipients?.length ? [`Recipients: ${page.draftRecipients.join(', ')}`] : []), ...page.elements.filter(element => element.value && !/password|secret|token|api key/i.test(element.text)).map(element => `${element.text}: ${element.value}`)].join('\n').slice(0, 3000) } });
        this.update({ current: { heard: text, matched: target.text || target.id, source: turn.source, state: 'needs_you' } });
        this.persist({ pendingConfirmation: this.view.pending ? { action: this.view.pending.action, description: this.view.pending.description, requestedAt: this.view.pending.requestedAt } : null, status: 'needs_user' });
        if (this.view.skill) this.update({ skill: { ...this.view.skill, status: 'needs_confirmation' } });
        this.waitForUser();
        this.log(`NEEDS YOU: ${description}`);
        this.onReply(`${description}. Say go ahead to confirm, or cancel.`);
        return;
      }
      await this.execute(action, false, description);
      await this.continueTask(action, description, generation);
    } catch (error) {
      this.task = null;
      this.log(error instanceof Error ? error.message : 'Could not process speech.');
      if (turn.source === 'user') this.onReply(error instanceof Error ? error.message : 'Could not process speech.');
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
    await this.continueTask(pending.action, pending.description, this.generation);
  }

  cancel() {
    this.generation++;
    this.task = null;
    this.confirmationPage = null;
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
        const observedUrl = finalUrl ? new URL(finalUrl) : null;
        const reached = finalUrl === destination.href || destination.pathname === '/' && !destination.search && observedUrl?.origin === destination.origin;
        if (!reached) {
          this.failAction(action, `Expected ${destination.href}, observed ${finalUrl || 'no completed URL'}.`);
          this.log('Navigation did not reach the requested URL. Action paused.');
          return;
        }
        const steps = this.view.procedure.steps.map(step => step.id === action.id ? { ...step, status: 'completed' as const } : step);
        this.update({ procedure: { ...this.view.procedure, steps }, ...(this.view.current ? { current: { ...this.view.current, state: 'verified' as const } } : {}) });
        this.persist({ procedure: this.view.procedure, status: 'listening' });
        this.recordAction(action.id, true, `Navigated to ${finalUrl}`);
        this.log(`VERIFIED: ${description}`);
        this.verifiedReply(description);
      } catch (error) {
        this.failAction(action, error instanceof Error ? error.message : 'Navigation failed.');
        this.log('Navigation failed. Action paused.');
      }
      return;
    }
    if (action.type === 'append') {
      if (!tab || action.target !== 'docs_body' || action.risk !== 'prepare') { this.failAction(action, 'Invalid document action.'); return; }
      try {
        await browser.tabs.sendMessage(tab, { type: 'POINT_AT', id: 'docs_body' } satisfies PageRequest);
        if (executionGeneration !== this.generation) return;
        await appendToGoogleDoc(tab, action.value || '');
        const steps = this.view.procedure.steps.map(step => step.id === action.id ? { ...step, status: 'completed' as const } : step);
        this.update({ procedure: { ...this.view.procedure, steps }, ...(this.view.current ? { current: { ...this.view.current, state: 'verified' as const } } : {}) });
        this.recordAction(action.id, true, 'Document text observed after input.');
        this.log(`VERIFIED: ${description}`);
        this.verifiedReply(description);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Document input failed.';
        this.failAction(action, message);
        this.log(`ACTION FAILED: ${message}`);
        this.onReply(message);
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
    if (confirmed && this.confirmationPage && (tab !== this.confirmationPage.tabId || this.fieldsFingerprint(before) !== this.confirmationPage.fields)) {
      this.confirmationPage = null;
      this.failAction(action, 'The page or draft changed after approval was requested.');
      this.onReply('The draft changed. Review it and ask me to send again. Nothing was submitted.');
      return;
    }
    this.confirmationPage = null;
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
      this.onReply(`Action stopped. ${result.error}`);
      return;
    }
    const recipientInput = action.type === 'fill' && new URL(before.url).hostname === 'mail.google.com'
      && /^(to|to recipients|recipients|cc|bcc)(?:\s|$)/i.test(target.text) && target.tag === 'input';
    if (recipientInput) await commitGmailRecipient(tab);
    let verified = false;
    for (let attempt = 0; attempt < 8 && !verified; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      try {
        const after = await this.inspect();
        if (action.type === 'fill') {
          const field = after.elements.find(element => element.id === action.target);
          verified = recipientInput
            ? (action.value || '').split(/[,;]/).every(address => after.draftRecipients?.some(recipient => recipient.toLowerCase() === address.trim().toLowerCase()))
            : field?.value === action.value || field?.tag === 'select' && result?.ok === true && result.detail === 'Field value verified';
        }
        else verified = ['textbox', 'combobox'].includes(target.role) && after.elements.find(element => element.id === action.target)?.focused === true || after.url !== before.url || after.title !== before.title || JSON.stringify(after.elements) !== JSON.stringify(before.elements);
      } catch { /* Navigation may briefly replace the content script. */ }
    }
    if (!verified) {
      this.failAction(action, 'Expected page change not observed');
      this.log(`ACTION NEEDS CHECK: ${description}`);
      this.onReply('I could not verify the result. Check the page before repeating the request.');
      return;
    }
    const steps = this.view.procedure.steps.map(step => step.id === action.id ? { ...step, status: 'completed' as const } : step);
    this.update({ procedure: { ...this.view.procedure, steps } });
    if (this.view.current) this.update({ current: { ...this.view.current, state: 'verified' } });
    this.persist({ procedure: this.view.procedure, status: 'listening' });
    this.recordAction(action.id, true, description);
    this.log(`VERIFIED: ${description}`);
    this.verifiedReply(description);
    if (!this.activeSkill) {
      const learned = stepFromVerifiedAction(action.type, target.role, target.text);
      if (learned) void rememberVerifiedStep(learned, before.url);
    }
    this.finishSkillStep(action.type);
  }
}
