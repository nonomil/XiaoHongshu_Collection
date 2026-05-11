import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitize_note_filename } from '../src/exporters/filename.js';

test('sanitize_note_filename removes windows reserved characters', () => {
  const result = sanitize_note_filename('周报: 第一周/第二周?*', 'doc-1');
  assert.equal(result, '周报- 第一周-第二周');
});

test('sanitize_note_filename falls back when title is empty', () => {
  const result = sanitize_note_filename('', 'doc-9');
  assert.equal(result, 'untitled-doc-9');
});
