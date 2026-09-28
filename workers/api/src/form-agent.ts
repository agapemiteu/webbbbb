import type { PlanRequest, BrowserAction } from './index.ts';

// Exact named fields use a deterministic path. Compound requests stay with the planner.
export function planFormField(input: PlanRequest) {
  if (input.source !== 'user') return;
  const match = input.text.trim().match(/^(?:please\s+)?(?:fill(?:\s+in)?|set|change)\s+(?:the\s+)?(.+?)\s+(?:with|to)\s+(.+)$/i);
  if (!match || /\s+(?:and then|then|and (?:fill|set|change|submit|send|click))\s+/i.test(match[2])) return;
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const label = normalize(match[1].replace(/\s+field$/i, ''));
  const fields = input.page.elements.filter(element => element.id !== 'docs_body'
    && ['textbox', 'combobox'].includes(element.role) && normalize(element.text) === label);
  const question = (reason: string) => ({ kind: 'question', reason, confidence: 0, goal: input.procedure?.goal || '' });
  if (fields.length !== 1) return question(fields.length ? `There is more than one ${match[1]} field. Which one should I use?` : `I cannot find a field labelled ${match[1]}. Say the label shown on your page.`);
  const element = fields[0];
  let value = match[2].trim();
  if (/^(["']).*\1$/s.test(value)) value = value.slice(1, -1);
  if (!value || value.length > 4000) return question('Dictate a value between 1 and 4,000 characters.');
  if (element.options) {
    const options = element.options.filter(option => normalize(option) === normalize(value));
    if (options.length !== 1) return question(`Choose an available option for ${element.text}.`);
    value = options[0];
  }
  const action: BrowserAction = { id: crypto.randomUUID(), type: 'fill', target: element.id, targetText: element.text, value, risk: 'prepare' };
  return { kind: 'instruction', action, reason: `Fill ${element.text}.`, confidence: 1, goal: input.procedure?.goal || '', continueTask: false };
}

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
