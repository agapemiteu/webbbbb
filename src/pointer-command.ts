export type PointerCommand =
  | { kind: 'move'; dx: number; dy: number; nudge: boolean }
  | { kind: 'stop' | 'click' | 'slower' | 'faster' };

export function pointerCommand(text: string): PointerCommand | null {
  const value = text.toLowerCase().trim().replace(/^webb[, ]+/, '').replace(/[.!]+$/, '');
  if (/^(stop|there|stop moving)$/.test(value)) return { kind: 'stop' };
  if (/^(click|click that|click here)$/.test(value)) return { kind: 'click' };
  if (/^(slower|a bit slower)$/.test(value)) return { kind: 'slower' };
  if (/^(faster|a bit faster)$/.test(value)) return { kind: 'faster' };
  const match = value.match(/^(?:(?:go|move|come)\s+)?(?:(little|a little|a bit)\s+)?(up|down|left|right)$/);
  if (!match) return null;
  const directions: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const [dx, dy] = directions[match[2]!]!;
  return { kind: 'move', dx, dy, nudge: !!match[1] };
}
