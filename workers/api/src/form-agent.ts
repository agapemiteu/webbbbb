import type { PlanRequest, BrowserAction } from './index.ts';

export function planSelectOption(input: PlanRequest) {
  if (input.source !== 'user' || /\b(later|after|eventually|tomorrow|if|unless)\b/i.test(input.text)) return;
  if (!/^(?:please\s+)?(?:select|choose|pick|set)\b/i.test(input.text.trim())) return;
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const instruction = ` ${normalize(input.text)} `;
  const matches = input.page.elements.flatMap(element => (element.options || [])
    .filter(option => normalize(option).length >= 2 && instruction.includes(` ${normalize(option)} `))
    .map(option => ({ element, option })));
  const named = matches.filter(match => instruction.includes(` ${normalize(match.element.text)} `));
  const candidates = named.length ? named : matches;
  if (!candidates.length) return;
  if (candidates.length !== 1) return { kind: 'question', reason: 'Which dropdown should I change? Say its label and the option.', confidence: 0, goal: '' };
  const { element, option } = candidates[0];
  const action: BrowserAction = { id: crypto.randomUUID(), type: 'fill', target: element.id, targetText: element.text, value: option, risk: 'prepare' };
  return { kind: 'instruction', action, reason: `Select ${option} in ${element.text}.`, confidence: 1, goal: input.procedure?.goal || '', continueTask: false };
}
