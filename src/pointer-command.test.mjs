import assert from 'node:assert/strict';
import test from 'node:test';
import { pointerCommand } from './pointer-command.ts';

test('pointer steering accepts direct motion without capturing named navigation', () => {
  assert.deepEqual(pointerCommand('Webb, move right.'), { kind: 'move', dx: 1, dy: 0, nudge: false });
  assert.deepEqual(pointerCommand('A little up'), { kind: 'move', dx: 0, dy: -1, nudge: true });
  assert.deepEqual(pointerCommand('There'), { kind: 'stop' });
  assert.deepEqual(pointerCommand('Click that'), { kind: 'click' });
  assert.equal(pointerCommand('Click Send'), null);
  assert.equal(pointerCommand('Go to Settings'), null);
  assert.equal(pointerCommand('Do not move right'), null);
});
