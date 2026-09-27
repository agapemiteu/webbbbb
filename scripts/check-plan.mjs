const api = process.env.WEBB_API_URL || 'https://webb-api.collins-coordinator-worker.workers.dev';
const origin = process.env.WEBB_ORIGIN || 'https://webb-five-puce.vercel.app';

const response = await fetch(`${api}/plan`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source: 'followed_tab',
    text: 'Open Settings.',
    page: {
      url: 'https://webb-five-puce.vercel.app/demo/',
      title: 'Acme Cloud',
      elements: [
        { id: 'el_settings', role: 'link', tag: 'a', text: 'Settings' },
        { id: 'el_projects', role: 'link', tag: 'a', text: 'Projects' },
      ],
    },
    procedure: { goal: 'Configure a project', steps: [] },
  }),
});
const plan = await response.json();
if (!response.ok || plan.kind !== 'instruction' || plan.action?.type !== 'click'
  || plan.action.target !== 'el_settings' || plan.action.risk !== 'auto') {
  throw new Error(`Webb planner failed the Settings smoke check (${response.status}): ${JSON.stringify(plan)}`);
}
console.log('Webb live Groq planner selected Settings.');
