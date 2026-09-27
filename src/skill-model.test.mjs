import assert from 'node:assert/strict';
import test from 'node:test';
import { appendStep, requestedSkill, stepFromVerifiedAction, validRecentRun, videoSource } from './skill-model.ts';

test('a learned workflow keeps repeated controls in order and stores no field value', () => {
  const run = { id: 'run', source: null, targetHost: '', steps: [], updatedAt: 0 };
  const next = stepFromVerifiedAction('click', 'button', 'Next');
  const field = stepFromVerifiedAction('fill', 'textbox', 'Project name');
  assert.ok(next && field);
  const first = appendStep(run, next, 'https://example.com/start');
  const second = appendStep(first, next, 'https://example.com/second');
  const third = appendStep(second, field, 'https://example.com/second');
  assert.deepEqual(third.steps.map(step => step.label), ['Next', 'Next', 'Project name']);
  assert.equal(third.targetHost, 'example.com');
  assert.equal(JSON.stringify(third).includes('private project value'), false);
});

test('video memory strips tracking parameters without treating lookalike hosts as YouTube', () => {
  assert.equal(videoSource('Lesson', 'https://www.youtube.com/watch?v=abc&utm_source=mail')?.url, 'https://www.youtube.com/watch?v=abc');
  assert.equal(videoSource('Lesson', 'https://notyoutube.com/watch?v=abc&token=private')?.url, 'https://notyoutube.com/watch');
  assert.equal(videoSource('Lesson', 'javascript:alert(1)'), null);
});

test('skill commands require a named saved workflow and invalid saved data is rejected', () => {
  const skill = { id: 'skill', name: 'Set up project', source: null, targetHost: 'example.com', steps: [{ type: 'click', role: 'link', label: 'Settings' }], updatedAt: 1, createdAt: 1 };
  assert.equal(requestedSkill('Run skill Set up project', [skill])?.id, 'skill');
  assert.equal(requestedSkill('Run skill missing', [skill]), null);
  assert.equal(requestedSkill('Open Settings', [skill]), undefined);
  assert.equal(validRecentRun({ ...skill, steps: [{ type: 'navigate', role: 'link', label: 'https://evil.test' }] }), false);
});
