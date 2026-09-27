export function targetForFollow(targetTabId: number | null, sourceTabId: number): number | null {
  return targetTabId === sourceTabId ? null : targetTabId;
}
