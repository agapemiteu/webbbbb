type TranscriptTurn = {
  source: 'user' | 'followed_tab';
  text: string;
  timestamp: number;
  final: boolean;
};

type ProcedureStep = {
  id: string;
  instruction: string;
  status: 'pending' | 'current' | 'completed' | 'skipped' | 'failed';
};

type Procedure = { goal: string; steps: ProcedureStep[] };
type ActionRecord = { actionId: string; success: boolean; observedState: string; timestamp: number };
type PendingConfirmation = {
  action: { id: string; type: 'click' | 'fill'; target: string; value?: string; risk: 'confirm' };
  description: string;
  requestedAt: number;
};

export type SessionState = {
  sessionId: string;
  revision: number;
  mode: 'idle' | 'talk' | 'follow';
  procedure: Procedure;
  latestTutorialTurn: TranscriptTurn | null;
  latestUserTurn: TranscriptTurn | null;
  pageContext: { url: string; title: string; elements: unknown[] } | null;
  actionHistory: ActionRecord[];
  pendingConfirmation: PendingConfirmation | null;
  status: 'idle' | 'listening' | 'planning' | 'acting' | 'needs_user' | 'error' | 'complete';
  createdAt: number;
  updatedAt: number;
};

type SessionPatch = Partial<Pick<SessionState,
  'mode' | 'procedure' | 'latestTutorialTurn' |
  'latestUserTurn' | 'pageContext' | 'pendingConfirmation' | 'status'>>;

// This minimal interface keeps the Worker independent of generated Cloudflare types.
interface SessionContext {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    setAlarm(timestamp: number): Promise<void>;
    deleteAll(): Promise<void>;
  };
}

const sessionTtlMs = 24 * 60 * 60 * 1000;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTurn(value: unknown): value is TranscriptTurn {
  return isObject(value) && ['user', 'followed_tab'].includes(String(value.source))
    && typeof value.text === 'string' && value.text.length <= 1000
    && typeof value.timestamp === 'number' && Number.isFinite(value.timestamp)
    && typeof value.final === 'boolean';
}

function isProcedure(value: unknown): value is Procedure {
  return isObject(value) && typeof value.goal === 'string' && value.goal.length <= 300
    && Array.isArray(value.steps) && value.steps.length <= 30
    && value.steps.every((step) => isObject(step)
      && typeof step.id === 'string' && step.id.length <= 80
      && typeof step.instruction === 'string' && step.instruction.length <= 300
      && ['pending', 'current', 'completed', 'skipped', 'failed'].includes(String(step.status)));
}

function isConfirmation(value: unknown): value is PendingConfirmation {
  return isObject(value) && isObject(value.action)
    && typeof value.action.id === 'string' && value.action.id.length <= 80
    && ['click', 'fill'].includes(String(value.action.type))
    && typeof value.action.target === 'string' && value.action.target.length <= 80
    && (value.action.targetText === undefined || (typeof value.action.targetText === 'string' && value.action.targetText.length <= 400))
    && (value.action.value === undefined || (typeof value.action.value === 'string' && value.action.value.length <= 500))
    && value.action.risk === 'confirm'
    && typeof value.description === 'string' && value.description.length <= 300
    && typeof value.requestedAt === 'number' && Number.isFinite(value.requestedAt);
}

function isPatch(value: unknown): value is SessionPatch {
  if (!isObject(value)) return false;
  const allowed = new Set(['mode', 'procedure', 'latestTutorialTurn',
    'latestUserTurn', 'pageContext', 'pendingConfirmation', 'status']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (value.mode !== undefined && !['idle', 'talk', 'follow'].includes(String(value.mode))) return false;
  if (value.status !== undefined && !['idle', 'listening', 'planning', 'acting', 'needs_user', 'error', 'complete'].includes(String(value.status))) return false;
  if (value.procedure !== undefined && !isProcedure(value.procedure)) return false;
  if (value.latestTutorialTurn !== undefined && value.latestTutorialTurn !== null
    && (!isTurn(value.latestTutorialTurn) || value.latestTutorialTurn.source !== 'followed_tab')) return false;
  if (value.latestUserTurn !== undefined && value.latestUserTurn !== null
    && (!isTurn(value.latestUserTurn) || value.latestUserTurn.source !== 'user')) return false;
  if (value.pageContext !== undefined && value.pageContext !== null) {
    const page = value.pageContext;
    if (!isObject(page) || typeof page.url !== 'string' || page.url.length > 2048
      || typeof page.title !== 'string' || page.title.length > 300
      || !Array.isArray(page.elements) || page.elements.length > 150) return false;
  }
  if (value.pendingConfirmation !== undefined && value.pendingConfirmation !== null
    && !isConfirmation(value.pendingConfirmation)) return false;
  return true;
}

function isActionRecord(value: unknown): value is ActionRecord {
  return isObject(value) && typeof value.actionId === 'string' && value.actionId.length <= 80
    && typeof value.success === 'boolean'
    && typeof value.observedState === 'string' && value.observedState.length <= 500
    && typeof value.timestamp === 'number' && Number.isFinite(value.timestamp);
}

async function readBody(request: Request): Promise<unknown> {
  const body = await request.text();
  if (body.length > 64_000) throw new Error('too_large');
  return JSON.parse(body);
}

export class WebbSession {
  private readonly ctx: SessionContext;

  constructor(ctx: SessionContext) {
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const state = await this.ctx.storage.get<SessionState>('state');
    if (state && Date.now() - state.updatedAt >= sessionTtlMs) {
      await this.ctx.storage.deleteAll();
      return json({ error: 'Session expired' }, 404);
    }

    if (url.pathname === '/init' && request.method === 'POST') {
      if (state) return json(state);
      let body: unknown;
      try { body = await readBody(request); } catch { return json({ error: 'Invalid body' }, 400); }
      if (!isObject(body) || typeof body.sessionId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.sessionId)) {
        return json({ error: 'Invalid session id' }, 400);
      }
      const now = Date.now();
      const created: SessionState = {
        sessionId: body.sessionId,
        revision: 0,
        mode: 'idle',
        procedure: { goal: '', steps: [] },
        latestTutorialTurn: null,
        latestUserTurn: null,
        pageContext: null,
        actionHistory: [],
        pendingConfirmation: null,
        status: 'idle',
        createdAt: now,
        updatedAt: now,
      };
      await this.ctx.storage.put('state', created);
      await this.ctx.storage.setAlarm(now + sessionTtlMs);
      return json(created, 201);
    }

    if (url.pathname === '/state' && request.method === 'DELETE') {
      await this.ctx.storage.deleteAll();
      return json({ deleted: true });
    }

    if (!state) return json({ error: 'Session not found' }, 404);
    if (url.pathname === '/state' && request.method === 'GET') return json(state);

    if (url.pathname === '/state' && request.method === 'PATCH') {
      let body: unknown;
      try { body = await readBody(request); } catch { return json({ error: 'Invalid body' }, 400); }
      if (!isObject(body) || !Number.isInteger(body.expectedRevision) || !isPatch(body.patch)) {
        return json({ error: 'Invalid state patch' }, 400);
      }
      if (body.expectedRevision !== state.revision) return json({ error: 'Revision conflict', current: state }, 409);
      const updated = { ...state, ...body.patch, revision: state.revision + 1, updatedAt: Date.now() };
      await this.ctx.storage.put('state', updated);
      await this.ctx.storage.setAlarm(updated.updatedAt + sessionTtlMs);
      return json(updated);
    }

    if (url.pathname === '/events' && request.method === 'POST') {
      let body: unknown;
      try { body = await readBody(request); } catch { return json({ error: 'Invalid body' }, 400); }
      if (!isObject(body) || !Number.isInteger(body.expectedRevision) || !isActionRecord(body.action)) {
        return json({ error: 'Invalid action event' }, 400);
      }
      if (body.expectedRevision !== state.revision) return json({ error: 'Revision conflict', current: state }, 409);
      const updated: SessionState = {
        ...state,
        actionHistory: [...state.actionHistory, body.action].slice(-50),
        revision: state.revision + 1,
        updatedAt: Date.now(),
      };
      await this.ctx.storage.put('state', updated);
      await this.ctx.storage.setAlarm(updated.updatedAt + sessionTtlMs);
      return json(updated);
    }

    return json({ error: 'Not found' }, 404);
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
