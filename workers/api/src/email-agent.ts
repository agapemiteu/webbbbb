import type { PlanRequest, Kind, BrowserAction } from './index.ts';

// Deterministic preparation for fully dictated email details; other phrasing uses the planner.
export function planEmailTask(input: PlanRequest): { kind: Kind; reason: string; confidence: number; goal: string; action?: BrowserAction; continueTask?: boolean } | undefined {
  if (input.source !== 'user' || !/^(?:compose|draft|prepare|write|send)\b/i.test(input.text.trim())) return;
  const recipient = input.text.match(/\bemail\s+(?:to\s+)?([a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,})/i)?.[1];
  const subject = input.text.match(/\bsubject(?:\s+(?:is|of))?[: ]+(.+?)(?=\s+(?:and\s+)?(?:message|body)\b)/i)?.[1]?.trim();
  const body = input.text.match(/\b(?:message|body)(?:\s+(?:is|saying))?[: ]+([\s\S]+?)(?=\s+(?:then|and)\s+send(?:\s+it)?[.!]?$|$)/i)?.[1]?.trim();
  if (!recipient || !subject || !body || subject.length > 200 || body.length > 1000) return;
  const send = /(?:^send\b|\b(?:then|and)\s+send\b)/i.test(input.text);
  const base = { kind: 'instruction' as Kind, reason: 'Prepare the email details you dictated.', confidence: 1, goal: 'Prepare email' };
  const progress = input.taskProgress || [];
  const controls = input.page.elements;
  const compose = controls.find(element => /^compose$/i.test(element.text.trim()));
  const subjectField = controls.find(element => /^subject$/i.test(element.text.trim()));
  if (!subjectField && compose) return { ...base, continueTask: true, action: { id: crypto.randomUUID(), type: 'click', target: compose.id, targetText: compose.text, risk: 'auto' } };
  const fields = [
    { name: /^(to|to recipients|recipients)$/i, value: recipient, friendly: 'recipient' },
    { name: /^subject$/i, value: subject, friendly: 'subject' },
    { name: /^(message body|message|body)$/i, value: body, friendly: 'message body' },
  ];
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    if (progress.some(step => step.startsWith('Fill ') && field.name.test(step.slice(5, step.indexOf(':'))) && step.endsWith(`: ${field.value}`))) continue;
    const element = controls.find(item => field.name.test(item.text.trim()));
    if (!element) return { ...base, kind: 'context', reason: `Open an email draft where Webb can find the ${field.friendly}.` };
    return { ...base, continueTask: index < fields.length - 1 || send, action: { id: crypto.randomUUID(), type: 'fill', target: element.id, targetText: element.text, value: field.value, risk: 'prepare' } };
  }
  if (send) {
    const element = controls.find(item => /^send(?: \(.+\))?$/i.test(item.text.trim()));
    if (element) return { ...base, continueTask: false, action: { id: crypto.randomUUID(), type: 'click', target: element.id, targetText: element.text, risk: 'confirm' } };
    return { ...base, kind: 'context', reason: 'The draft is prepared. I cannot find its Send control.' };
  }
  return { ...base, kind: 'result', reason: 'Your email draft is ready for review.' };
}

