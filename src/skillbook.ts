import { browser } from 'wxt/browser';
import {
  appendStep, conciseLabel, validRecentRun, validSkill,
  type RecentRun, type SkillSource, type SkillStep, type WebbSkill,
} from './skill-model';

export const SKILLS_KEY = 'webbSkillbookV1';
export const RECENT_RUN_KEY = 'webbRecentRunV1';
export const LAST_VIDEO_KEY = 'webbLastVideoV1';

let writes: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = writes.then(operation);
  writes = result.catch(() => {});
  return result;
}

function newRun(source: SkillSource | null): RecentRun {
  return { id: crypto.randomUUID(), source, targetHost: '', steps: [], updatedAt: Date.now() };
}

export async function loadSkillbook(): Promise<{ skills: WebbSkill[]; recent: RecentRun | null; lastVideo: SkillSource | null }> {
  await writes;
  const saved = await browser.storage.local.get([SKILLS_KEY, RECENT_RUN_KEY, LAST_VIDEO_KEY]);
  const skills = Array.isArray(saved[SKILLS_KEY]) ? saved[SKILLS_KEY].filter(validSkill).slice(0, 12) : [];
  const recent = validRecentRun(saved[RECENT_RUN_KEY]) ? saved[RECENT_RUN_KEY] : null;
  const video = saved[LAST_VIDEO_KEY] as Partial<SkillSource> | undefined;
  const lastVideo = video && typeof video === 'object' && typeof video.title === 'string'
    && typeof video.url === 'string' && video.kind === 'video' ? video as SkillSource : null;
  return { skills, recent, lastVideo };
}

export function beginVideoRun(source: SkillSource): Promise<void> {
  return enqueue(async () => {
    await browser.storage.local.set({ [RECENT_RUN_KEY]: newRun(source), [LAST_VIDEO_KEY]: source });
  });
}

export function beginManualRun(): Promise<void> {
  return enqueue(async () => {
    await browser.storage.local.set({ [RECENT_RUN_KEY]: newRun(null) });
  });
}

export function rememberVerifiedStep(step: SkillStep, pageUrl: string): Promise<void> {
  return enqueue(async () => {
    const saved = await browser.storage.local.get(RECENT_RUN_KEY);
    const run = validRecentRun(saved[RECENT_RUN_KEY]) ? saved[RECENT_RUN_KEY] : newRun(null);
    await browser.storage.local.set({ [RECENT_RUN_KEY]: appendStep(run, step, pageUrl) });
  });
}

export function saveRecentAsSkill(name: string): Promise<WebbSkill> {
  return enqueue(async () => {
    const saved = await browser.storage.local.get([RECENT_RUN_KEY, SKILLS_KEY]);
    const run = saved[RECENT_RUN_KEY];
    if (!validRecentRun(run) || !run.steps.length) throw new Error('Complete a browser step before saving a skill.');
    const title = conciseLabel(name).slice(0, 80);
    if (!title) throw new Error('Give the skill a name.');
    const skill: WebbSkill = { ...run, id: crypto.randomUUID(), name: title, createdAt: Date.now() };
    const prior = Array.isArray(saved[SKILLS_KEY]) ? saved[SKILLS_KEY].filter(validSkill) as WebbSkill[] : [];
    const skills = [skill, ...prior.filter(item => item.name.toLowerCase() !== title.toLowerCase())].slice(0, 12);
    await browser.storage.local.set({ [SKILLS_KEY]: skills });
    return skill;
  });
}

export function deleteSkill(id: string): Promise<void> {
  return enqueue(async () => {
    const saved = await browser.storage.local.get(SKILLS_KEY);
    const skills = Array.isArray(saved[SKILLS_KEY]) ? saved[SKILLS_KEY].filter(validSkill) as WebbSkill[] : [];
    await browser.storage.local.set({ [SKILLS_KEY]: skills.filter(skill => skill.id !== id) });
  });
}

export async function clearSkillbook(): Promise<void> {
  await writes;
  await browser.storage.local.remove([SKILLS_KEY, RECENT_RUN_KEY, LAST_VIDEO_KEY]);
}
