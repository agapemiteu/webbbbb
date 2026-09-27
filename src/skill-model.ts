export type SkillSource = {
  kind: 'video' | 'manual';
  title: string;
  url: string;
};

export type SkillStep = {
  type: 'click' | 'fill';
  role: string;
  label: string;
};

export type RecentRun = {
  id: string;
  source: SkillSource | null;
  targetHost: string;
  steps: SkillStep[];
  updatedAt: number;
};

export type WebbSkill = RecentRun & {
  name: string;
  createdAt: number;
};

const MAX_STEPS = 16;

export function conciseLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 90);
}

export function videoSource(title: string, rawUrl: string): SkillSource | null {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const youtube = url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com');
    const videoId = youtube ? url.searchParams.get('v') : null;
    url.search = videoId ? `?v=${encodeURIComponent(videoId)}` : '';
    url.hash = '';
    return { kind: 'video', title: conciseLabel(title) || url.hostname, url: url.href };
  } catch {
    return null;
  }
}

export function stepFromVerifiedAction(type: string, role: string, label: string): SkillStep | null {
  if (type !== 'click' && type !== 'fill') return null;
  const clean = conciseLabel(label);
  if (!clean || /password|passcode|secret|api key|token/i.test(clean)) return null;
  return { type, role: conciseLabel(role).toLowerCase().slice(0, 32), label: clean };
}

export function appendStep(run: RecentRun, step: SkillStep, pageUrl: string): RecentRun {
  let targetHost = run.targetHost;
  try { targetHost ||= new URL(pageUrl).hostname; } catch { /* Keep the current host. */ }
  return { ...run, targetHost, steps: [...run.steps, step].slice(-MAX_STEPS), updatedAt: Date.now() };
}

export function requestedSkill(text: string, skills: WebbSkill[]): WebbSkill | null | undefined {
  const phrase = text.trim().replace(/[.!]$/, '');
  const match = phrase.match(/^(?:run|use|repeat)\s+(?:(?:my|saved|the)\s+)?(?:skill\s+)?(.+)$/i)
    || phrase.match(/^do the last tutorial again$/i);
  if (!match) return undefined;
  const requested = (match[1] || 'last').toLowerCase().replace(/\s+skill$/, '').trim();
  if (['last', 'latest', 'last tutorial', 'last workflow'].includes(requested)) return skills[0] || null;
  return skills.find(skill => skill.name.toLowerCase() === requested) || null;
}

export function stepInstruction(step: SkillStep, value?: string): string {
  if (step.type === 'click') return `Open the current equivalent of ${step.label}`;
  return `Fill ${step.label} with ${value || ''}`;
}

export function validRecentRun(value: unknown): value is RecentRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<RecentRun>;
  return typeof run.id === 'string' && typeof run.targetHost === 'string'
    && typeof run.updatedAt === 'number' && Array.isArray(run.steps)
    && run.steps.length <= MAX_STEPS && run.steps.every(step =>
      step && ['click', 'fill'].includes(step.type)
      && typeof step.role === 'string' && typeof step.label === 'string' && step.label.length <= 90)
    && (run.source === null || !!run.source && typeof run.source.title === 'string'
      && typeof run.source.url === 'string' && ['video', 'manual'].includes(run.source.kind));
}

export function validSkill(value: unknown): value is WebbSkill {
  return validRecentRun(value) && typeof (value as WebbSkill).name === 'string'
    && (value as WebbSkill).name.length <= 80 && typeof (value as WebbSkill).createdAt === 'number';
}
