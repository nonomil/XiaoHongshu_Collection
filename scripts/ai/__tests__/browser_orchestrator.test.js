const { test } = require('node:test');
const assert = require('node:assert/strict');

const { CodexTaskError } = require('../../lib/errors');
const { createJsonCheckpointStore } = require('../../lib/browser_checkpoint_store');
const {
  buildTaskRunId,
  runBrowserTaskOrchestrator,
  shouldRequestHumanHandoff
} = require('../../lib/browser_orchestrator');

function createMemoryStore() {
  const writes = new Map();
  return createJsonCheckpointStore({
    rootDir: 'G:/tmp/orchestrator',
    mkdirSync: () => {},
    existsSync: (filepath) => writes.has(filepath),
    readFileSync: (filepath) => writes.get(filepath),
    writeFileSync: (filepath, payload) => {
      writes.set(filepath, payload);
    }
  });
}

function createTask() {
  return {
    type: 'note-save',
    source: 'cli',
    input: 'https://www.xiaohongshu.com/explore/abc123',
    options: {},
    requestedAt: '2026-04-06T12:00:00.000Z'
  };
}

test('buildTaskRunId creates deterministic run id from task', () => {
  assert.equal(
    buildTaskRunId(createTask()),
    'note-save-cli-2026-04-06T120000000Z'
  );
});

test('runBrowserTaskOrchestrator completes ordered states and persists result', async () => {
  const calls = [];
  const result = await runBrowserTaskOrchestrator({
    task: createTask(),
    states: ['attach_browser', 'load_note', 'validate_result'],
    checkpointStore: createMemoryStore(),
    executeStep: async ({ state }) => {
      calls.push(state);
      if (state === 'validate_result') {
        return {
          status: 'success',
          result: { noteId: 'abc123', comments: 12 }
        };
      }
      return { status: 'success' };
    }
  });

  assert.deepEqual(calls, ['attach_browser', 'load_note', 'validate_result']);
  assert.equal(result.status, 'done');
  assert.equal(result.result.noteId, 'abc123');
});

test('runBrowserTaskOrchestrator retries transient errors before succeeding', async () => {
  let attempt = 0;
  const result = await runBrowserTaskOrchestrator({
    task: createTask(),
    states: ['attach_browser', 'load_note'],
    checkpointStore: createMemoryStore(),
    maxAttemptsPerState: 3,
    executeStep: async ({ state }) => {
      if (state === 'attach_browser') {
        attempt += 1;
        if (attempt < 2) {
          throw new CodexTaskError('chrome_unavailable', 'connect ECONNREFUSED 127.0.0.1:9222', {
            retriable: true
          });
        }
      }
      return { status: 'success' };
    }
  });

  assert.equal(result.status, 'done');
  assert.equal(result.attempts.attach_browser, 2);
  assert.equal(result.state, 'load_note');
});

test('runBrowserTaskOrchestrator escalates login errors to human handoff', async () => {
  const result = await runBrowserTaskOrchestrator({
    task: createTask(),
    states: ['attach_browser', 'load_note'],
    checkpointStore: createMemoryStore(),
    executeStep: async ({ state }) => {
      if (state === 'load_note') {
        throw new CodexTaskError('login_required', '无登录信息或登录已失效，请重新登录', {
          retriable: false
        });
      }
      return { status: 'success' };
    }
  });

  assert.equal(result.status, 'need_human');
  assert.equal(result.lastError.code, 'login_required');
  assert.equal(result.lastError.state, 'load_note');
});

test('runBrowserTaskOrchestrator can resume a terminal handoff state when resumeTerminalState is enabled', async () => {
  const checkpointStore = createMemoryStore();
  const task = createTask();
  const runId = buildTaskRunId(task);
  checkpointStore.saveCheckpoint(runId, {
    runId,
    task,
    startedAt: '2026-04-06T12:00:00.000Z',
    updatedAt: '2026-04-06T12:01:00.000Z',
    states: ['attach_browser', 'load_note', 'validate_result'],
    state: 'load_note',
    status: 'need_human',
    attempts: {
      attach_browser: 1,
      load_note: 1
    },
    observations: [],
    warnings: [{
      state: 'load_note',
      code: 'login_required',
      message: '无登录信息或登录已失效，请重新登录'
    }],
    transitions: [{
      at: '2026-04-06T12:00:30.000Z',
      from: 'attach_browser',
      to: 'load_note',
      reason: 'step_succeeded'
    }],
    lastError: {
      state: 'load_note',
      code: 'login_required',
      message: '无登录信息或登录已失效，请重新登录',
      retryable: false
    },
    result: null,
    metadata: {}
  });

  const calls = [];
  const result = await runBrowserTaskOrchestrator({
    task,
    states: ['attach_browser', 'load_note', 'validate_result'],
    checkpointStore,
    resumeTerminalState: true,
    executeStep: async ({ state }) => {
      calls.push(state);
      if (state === 'load_note') {
        return {
          status: 'success',
          result: {
            noteId: 'abc123'
          }
        };
      }
      return { status: 'success' };
    }
  });

  assert.deepEqual(calls, ['load_note', 'validate_result']);
  assert.equal(result.status, 'done');
  assert.equal(result.attempts.load_note, 2);
  assert.ok(result.observations.some((entry) => entry.type === 'resume'));
});

test('shouldRequestHumanHandoff recognizes risk control and captcha style errors', () => {
  assert.equal(
    shouldRequestHumanHandoff({
      errorInfo: { code: 'account_risk_control', message: '当前账号存在异常', retriable: false },
      attemptCount: 1,
      maxAttemptsPerState: 2
    }),
    true
  );

  assert.equal(
    shouldRequestHumanHandoff({
      errorInfo: { code: 'unknown', message: '出现验证码，请人工处理', retriable: false },
      attemptCount: 1,
      maxAttemptsPerState: 2
    }),
    true
  );
});
