const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveDelayMs, retryAsync } = require('../../lib/async_control');

test('resolveDelayMs adds jitter to base delay', () => {
  const delay = resolveDelayMs({ baseMs: 100, jitterMs: 50, rng: () => 0.5 });
  assert.equal(delay, 125);
});

test('retryAsync retries with exponential backoff', async () => {
  let attempts = 0;
  const waits = [];

  const result = await retryAsync(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error('fail');
    }
    return 'ok';
  }, {
    retries: 2,
    baseDelayMs: 100,
    maxDelayMs: 500,
    jitterMs: 0,
    wait: async (ms) => { waits.push(ms); }
  });

  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [100, 200]);
});

test('retryAsync throws after exhausting retries', async () => {
  const waits = [];
  await assert.rejects(
    () => retryAsync(async () => {
      throw new Error('always');
    }, {
      retries: 1,
      baseDelayMs: 80,
      jitterMs: 0,
      wait: async (ms) => { waits.push(ms); }
    }),
    /always/
  );

  assert.deepEqual(waits, [80]);
});
