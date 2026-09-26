export type ElementInfo = {
  id: string;
  role: string;
  text: string;
  tag: string;
  value?: string;
};

export type PageSnapshot = {
  url: string;
  title: string;
  elements: ElementInfo[];
};

export type TranscriptTurn = {
  source: 'user' | 'followed_tab';
  text: string;
  timestamp: number;
  final: boolean;
};

export type InstructionEvent = {
  turn: TranscriptTurn;
  kind: 'instruction' | 'explanation' | 'warning' | 'context' | 'question' | 'result';
};

export type PageContext = PageSnapshot;

export type ProcedureStep = {
  id: string;
  instruction: string;
  status: 'pending' | 'current' | 'completed' | 'skipped' | 'failed';
};

export type ProcedureState = {
  goal: string;
  steps: ProcedureStep[];
};

export type BrowserAction = {
  id: string;
  type: 'click' | 'fill' | 'scroll' | 'navigate' | 'select';
  url?: string;
  target?: string;
  targetText?: string;
  value?: string;
  risk: 'auto' | 'prepare' | 'confirm';
};

export type ActionResult = {
  actionId: string;
  success: boolean;
  observedState: string;
  error?: string;
};

export type ConfirmationRequest = {
  action: BrowserAction;
  description: string;
  requestedAt: number;
};

export type SessionEvent =
  | { type: 'transcript'; turn: TranscriptTurn }
  | { type: 'instruction'; instruction: InstructionEvent }
  | { type: 'action'; result: ActionResult }
  | { type: 'confirmation'; request: ConfirmationRequest };

export type PageRequest =
  | { type: 'INSPECT' }
  | { type: 'CLICK'; id: string; confirmed?: boolean }
  | { type: 'FILL'; id: string; value: string };

export type PageResponse =
  | { ok: true; snapshot: PageSnapshot; detail: string }
  | { ok: false; error: string };
