import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.ts';
import { WebbSession } from '../src/session.ts';

const noLimit = { limit: async () => ({ success: true }) };
const extensionOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const env = {
  ALLOWED_ORIGINS: 'https://webb-five-puce.vercel.app',
  GROQ_API_KEY: 'test-key',
  TOKEN_LIMITER: noLimit,
  PLAN_LIMITER: noLimit,
  SESSION_LIMITER: noLimit,
};
const origin = extensionOrigin;
const page = {
  url: 'https://example.com/project',
  title: 'Project',
  elements: [{ id: 'el_1', role: 'button', tag: 'button', text: 'Deploy' }],
};
const pendingConfirmation = {
  action: { id: 'action_1', type: 'click', target: 'el_1', risk: 'confirm' },
  description: 'Deploy project',
  requestedAt: Date.now(),
};

function planRequest(source, text, extra = {}) {
  return new Request('https://webb.example/plan', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, text, page, ...extra }),
  });
}

async function planWithModel(input, suggestion) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(suggestion) } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://webb.example/plan', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }), env);
    return response.json();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('rejects requests from other origins', async () => {
  const response = await worker.fetch(new Request('https://webb.example/session', {
    method: 'POST',
    headers: { Origin: 'https://other.example' },
  }), env);
  assert.equal(response.status, 403);
});

test('allows valid Chrome extension IDs and configured website origins', async () => {
  const extensionResponse = await worker.fetch(new Request('https://webb.example/session', {
    method: 'OPTIONS', headers: { Origin: extensionOrigin },
  }), env);
  assert.equal(extensionResponse.status, 204);
  assert.equal(extensionResponse.headers.get('Access-Control-Allow-Origin'), extensionOrigin);

  const siteOrigin = 'https://webb-five-puce.vercel.app';
  const siteResponse = await worker.fetch(new Request('https://webb.example/session', {
    method: 'OPTIONS', headers: { Origin: siteOrigin },
  }), env);
  assert.equal(siteResponse.status, 204);
  assert.equal(siteResponse.headers.get('Access-Control-Allow-Origin'), siteOrigin);
});

test('accepts originless extension token GETs only with Chrome fetch metadata and an extension ID', async () => {
  const headers = {
    'X-Webb-Extension': extensionOrigin.slice('chrome-extension://'.length),
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'cors',
  };
  const url = 'https://webb.example/assemblyai-token';
  const allowed = await worker.fetch(new Request(url, { headers }), { ...env, ASSEMBLYAI_API_KEY: undefined });
  assert.equal(allowed.status, 503);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), '*');

  for (const rejectedHeaders of [
    { ...headers, 'X-Webb-Extension': '' },
    { ...headers, 'Sec-Fetch-Site': 'cross-site' },
    { ...headers, 'Sec-Fetch-Mode': 'navigate' },
  ]) {
    const rejected = await worker.fetch(new Request(url, { headers: rejectedHeaders }), env);
    assert.equal(rejected.status, 403);
  }
  const rejectedPost = await worker.fetch(new Request(url, { method: 'POST', headers }), env);
  assert.equal(rejectedPost.status, 403);
});

test('allows the extension methods required for session state and deletion', async () => {
  const response = await worker.fetch(new Request('https://webb.example/session', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'PATCH',
      'Access-Control-Request-Headers': 'content-type',
    },
  }), env);
  assert.equal(response.status, 204);
  assert.match(response.headers.get('Access-Control-Allow-Methods'), /PATCH/);
  assert.match(response.headers.get('Access-Control-Allow-Methods'), /DELETE/);
});

test('only direct user speech can confirm a pending action', async () => {
  const tutorial = await worker.fetch(planRequest('followed_tab', 'Go ahead', { pendingConfirmation }), env);
  assert.equal((await tutorial.json()).action, undefined);

  const user = await worker.fetch(planRequest('user', 'Go ahead', { pendingConfirmation }), env);
  assert.deepEqual((await user.json()).action, pendingConfirmation.action);
});

test('a send-specific phrase cannot confirm a deployment', async () => {
  const response = await worker.fetch(planRequest('user', 'Yes, send it', { pendingConfirmation }), {
    ...env, GROQ_API_KEY: undefined,
  });
  assert.equal(response.status, 503);
});

test('direct send confirmation approves a pending email send only', async () => {
  const emailConfirmation = {
    ...pendingConfirmation,
    action: { ...pendingConfirmation.action, targetText: 'Send' },
    description: 'Open Send email',
  };
  const response = await worker.fetch(planRequest('user', 'Yes, send it', {
    pendingConfirmation: emailConfirmation,
  }), env);
  assert.equal((await response.json()).action.id, emailConfirmation.action.id);
});

test('direct user speech can open a named website with a structured navigation action', async () => {
  const response = await worker.fetch(planRequest('user', 'Open Gmail'), env);
  const plan = await response.json();
  assert.equal(plan.action.type, 'navigate');
  assert.equal(plan.action.url, 'https://mail.google.com');
  assert.equal(plan.action.risk, 'auto');
});

test('rate limits session creation before allocating Durable Object storage', async () => {
  const limited = { ...env, SESSION_LIMITER: { limit: async () => ({ success: false }) } };
  const response = await worker.fetch(new Request('https://webb.example/session', {
    method: 'POST', headers: { Origin: origin },
  }), limited);
  assert.equal(response.status, 429);
});

test('stale confirmation target cannot execute', async () => {
  const stalePage = { ...page, elements: [] };
  const request = planRequest('user', 'Go ahead', { page: stalePage, pendingConfirmation });
  const response = await worker.fetch(request, env);
  assert.equal((await response.json()).action, undefined);
});

test('prepares a labelled form field without submitting it', async () => {
  const formPage = {
    url: 'https://webb-five-puce.vercel.app/demo/form.html', title: 'Request form',
    elements: [
      { id: 'el_project', role: 'text', tag: 'input', text: 'Project name' },
      { id: 'el_send', role: 'button', tag: 'button', text: 'Send request' },
    ],
  };
  const result = await planWithModel({ source: 'user', text: 'Call the project Webb Demo', page: formPage }, {
    kind: 'instruction', action_type: 'fill', target_id: 'el_project', value: 'Webb Demo',
    reason: 'The user named the project', confidence: 0.98, goal: 'Prepare the request form',
  });
  assert.equal(result.action.risk, 'prepare');
  assert.equal(result.action.targetText, 'Project name');
  assert.notEqual(result.action.target, 'el_send');
});

test('requires direct user confirmation before sending a Teams-style message', async () => {
  const teamsPage = {
    url: 'https://webb-five-puce.vercel.app/demo/teams.html', title: 'Workroom',
    elements: [{ id: 'el_send', role: 'button', tag: 'button', text: 'Send message' }],
  };
  const result = await planWithModel({ source: 'followed_tab', text: 'Send the update', page: teamsPage }, {
    kind: 'instruction', action_type: 'click', target_id: 'el_send', value: null,
    reason: 'The tutorial asks to send the message', confidence: 0.97, goal: 'Share the update',
  });
  assert.equal(result.action.risk, 'confirm');
  assert.equal(result.action.targetText, 'Send message');
});

test('does not offer a browser action for lecture context', async () => {
  const lessonPage = {
    url: 'https://webb-five-puce.vercel.app/demo/tutorial.html', title: 'Lecture', elements: page.elements,
  };
  const result = await planWithModel({ source: 'followed_tab', text: 'There are several ways to connect a repository.', page: lessonPage }, {
    kind: 'explanation', action_type: 'none', target_id: null, value: null,
    reason: 'The lecturer is explaining options', confidence: 0.94, goal: 'Deploy project',
  });
  assert.equal(result.kind, 'explanation');
  assert.equal(result.action, undefined);
});

test('session state persists and rejects stale updates', async () => {
  const objects = new Map();
  const sessions = {
    idFromName: (name) => name,
    get(name) {
      if (!objects.has(name)) {
        const values = new Map();
        objects.set(name, new WebbSession({ storage: {
          get: async (key) => values.get(key),
          put: async (key, value) => { values.set(key, value); },
          setAlarm: async () => {},
          deleteAll: async () => { values.clear(); },
        } }));
      }
      return objects.get(name);
    },
  };
  const sessionEnv = { ...env, WEBB_SESSIONS: sessions };
  const create = await worker.fetch(new Request('https://webb.example/session', {
    method: 'POST', headers: { Origin: origin },
  }), sessionEnv);
  assert.equal(create.status, 201);
  const { sessionId } = await create.json();
  const endpoint = `https://webb.example/session/${sessionId}`;
  const patch = await worker.fetch(new Request(endpoint, {
    method: 'PATCH', headers: { Origin: origin },
    body: JSON.stringify({ expectedRevision: 0, patch: {
      mode: 'follow', procedure: { goal: 'Deploy project', steps: [] },
    } }),
  }), sessionEnv);
  assert.equal(patch.status, 200);
  assert.equal((await patch.json()).revision, 1);

  const read = await worker.fetch(new Request(endpoint, {
    headers: { Origin: origin },
  }), sessionEnv);
  assert.equal((await read.json()).procedure.goal, 'Deploy project');

  const stale = await worker.fetch(new Request(endpoint, {
    method: 'PATCH', headers: { Origin: origin },
    body: JSON.stringify({ expectedRevision: 0, patch: { mode: 'talk' } }),
  }), sessionEnv);
  assert.equal(stale.status, 409);

  const deleted = await worker.fetch(new Request(endpoint, {
    method: 'DELETE', headers: { Origin: origin },
  }), sessionEnv);
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { deleted: true });
  const gone = await worker.fetch(new Request(endpoint, {
    headers: { Origin: origin },
  }), sessionEnv);
  assert.equal(gone.status, 404);
});


test('rejects oversized source context before calling the model', async () => {
  const response = await worker.fetch(planRequest('user', 'Summarize this', {
    sourceContext: { title: 'Lecture', transcript: 'x'.repeat(8001) },
  }), env);
  assert.equal(response.status, 400);
});

test('source-context answers return no action', async () => {
  const plan = await planWithModel({ source: 'user', text: 'What did the speaker say?', page,
    sourceContext: { title: 'Lecture', transcript: 'We will discuss project settings.' } }, {
    kind: 'question', action_type: 'none', target_id: null, value: null,
    reason: 'The speaker introduced project settings.', confidence: 1, goal: '',
  });
  assert.equal(plan.reason, 'The speaker introduced project settings.');
  assert.equal(plan.action, undefined);
});
