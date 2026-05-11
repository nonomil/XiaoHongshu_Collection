const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseUserMeResponse } = require('../account_detect');

test('parseUserMeResponse extracts uid and nickname', () => {
  const sample = { data: { userId: '123', nickname: 'Alice' } };
  const out = parseUserMeResponse(sample);
  assert.deepEqual(out, { uid: '123', nickname: 'Alice' });
});

test('parseUserMeResponse handles missing payload', () => {
  const out = parseUserMeResponse(null);
  assert.deepEqual(out, { uid: '', nickname: '' });
});
