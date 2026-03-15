const { test } = require('node:test');
const assert = require('node:assert/strict');

const { scrollMoreComments } = require('../../lib/cdp_note');

test('scrollMoreComments attempts to scroll the root container', async () => {
  let capturedExpression = '';
  let evaluateCalled = false;
  const evaluate = async (expression) => {
    evaluateCalled = true;
    capturedExpression = expression;
    return { scrolled: true, scrolledRoot: true };
  };

  const ws = {
    _handler: null,
    on(event, handler) {
      if (event === 'message') this._handler = handler;
    },
    removeListener() {},
    send(payload) {
      const parsed = JSON.parse(payload);
      const message = JSON.stringify({
        id: parsed.id,
        result: { result: { value: JSON.stringify({ scrolled: false }) } }
      });
      if (this._handler) this._handler(message);
    }
  };

  const result = await scrollMoreComments(ws, { evaluate });

  assert.equal(result, true);
  assert.equal(evaluateCalled, true);
  assert.match(capturedExpression, /noteContainer|scrollTop|scrollTo/);
});
