import type { PlanRequest } from './index.ts';

export function namedPageControl(input: PlanRequest) {
  const match = input.text.trim().match(/^(?:(?:now|first|then)[, ]+)?(?:please\s+)?(?:open|click|go to|navigate to|show)\s+(?:the\s+)?(.+?)[.!]?$/i);
  if (!match || /\b(later|after|eventually|tomorrow|if|unless)\b/i.test(input.text)) return;
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const wanted = normalize(match[1].replace(/^current equivalent of\s+/i, ''));
  if (!wanted || wanted.length > 120) return;
  const candidates = input.page.elements.filter(element => {
    const text = normalize(element.text);
    const dangerous = /\b(delete|reset|remove|revoke|disable|clear|save|update|change)\b/i;
    if (dangerous.test(text) && !dangerous.test(wanted)) return false;
    return text === wanted || text.endsWith(` ${wanted}`);
  });
  const exact = candidates.filter(element => normalize(element.text) === wanted);
  const matches = exact.length ? exact : candidates;
  if (!matches.length) return;
  if (matches.length > 1) return { reason: `Several controls match ${match[1]}. Say the full label of the one you want.` };
  return { element: matches[0] };
}
