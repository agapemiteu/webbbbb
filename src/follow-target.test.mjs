import assert from 'node:assert/strict';
import test from 'node:test';
import { targetForFollow } from './follow-target.ts';

test('FOLLOW can start without a target and clears a tutorial tab chosen as its own target', () => {
  assert.equal(targetForFollow(null, 12), null);
  assert.equal(targetForFollow(12, 12), null);
  assert.equal(targetForFollow(27, 12), 27);
});
