const { classifyTaskError } = require('./errors');

const TERMINAL_TASK_STATUSES = new Set(['done', 'failed', 'need_human']);

function buildTaskRunId(task = {}, now = new Date()) {
  const taskType = String(task.type || 'task').trim() || 'task';
  const source = String(task.source || 'unknown').trim() || 'unknown';
  const requestedAt = String(task.requestedAt || '').trim();
  const stamp = requestedAt
    ? requestedAt.replace(/[^0-9TZ-]/g, '').replace(/[:]/g, '')
    : now.toISOString().replace(/[:.]/g, '-');
  return `${taskType}-${source}-${stamp}`;
}

function normalizeStateList(states = []) {
  const unique = [];
  const seen = new Set();
  for (const state of states) {
    const value = String(state || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function createTaskRuntime({
  task,
  runId,
  states = [],
  startedAt = new Date().toISOString(),
  initialState,
  checkpoint = null
} = {}) {
  const normalizedStates = normalizeStateList(states);
  const firstState = initialState || normalizedStates[0] || 'init';
  const restored = checkpoint && typeof checkpoint === 'object' ? checkpoint : null;

  return {
    runId: runId || buildTaskRunId(task),
    task,
    startedAt: restored?.startedAt || startedAt,
    updatedAt: startedAt,
    states: normalizedStates,
    state: restored?.state || firstState,
    status: restored?.status || 'running',
    attempts: restored?.attempts || {},
    observations: Array.isArray(restored?.observations) ? restored.observations.slice() : [],
    warnings: Array.isArray(restored?.warnings) ? restored.warnings.slice() : [],
    transitions: Array.isArray(restored?.transitions) ? restored.transitions.slice() : [],
    lastError: restored?.lastError || null,
    result: restored?.result || null,
    metadata: restored?.metadata && typeof restored.metadata === 'object' ? { ...restored.metadata } : {}
  };
}

function appendObservation(runtime, entry) {
  runtime.observations.push({
    at: new Date().toISOString(),
    ...entry
  });
}

function transitionTaskState(runtime, nextState, details = {}) {
  const previousState = runtime.state;
  runtime.state = nextState;
  runtime.updatedAt = new Date().toISOString();
  runtime.transitions.push({
    at: runtime.updatedAt,
    from: previousState,
    to: nextState,
    reason: details.reason || ''
  });
}

function advanceToNextState(runtime) {
  const index = runtime.states.indexOf(runtime.state);
  if (index < 0 || index === runtime.states.length - 1) {
    runtime.status = 'done';
    runtime.updatedAt = new Date().toISOString();
    return;
  }
  transitionTaskState(runtime, runtime.states[index + 1], { reason: 'step_succeeded' });
}

function buildHumanHandoff({ runtime, code, message, observation, retryable = false } = {}) {
  return {
    status: 'need_human',
    state: runtime.state,
    code: code || 'need_human',
    message: message || '需要人工介入',
    retryable: Boolean(retryable),
    observation: observation || null
  };
}

function shouldRequestHumanHandoff({
  errorInfo,
  attemptCount,
  maxAttemptsPerState,
  observation
} = {}) {
  const code = String(errorInfo?.code || '').trim();
  const message = String(errorInfo?.message || '').trim();
  const lower = `${code} ${message}`.toLowerCase();

  if (
    code === 'login_required' ||
    code === 'account_risk_control' ||
    /login_required|need_human|captcha|risk|风控|验证码|重新登录|账号存在异常|无登录信息|登录失效/.test(lower)
  ) {
    return true;
  }

  if (observation?.requiresHuman === true) {
    return true;
  }

  return Boolean(maxAttemptsPerState > 0 && attemptCount >= maxAttemptsPerState && errorInfo?.retriable);
}

function snapshotRuntime(runtime) {
  return JSON.parse(JSON.stringify(runtime));
}

async function persistRuntime(runtime, checkpointStore) {
  if (!checkpointStore || typeof checkpointStore.saveCheckpoint !== 'function') {
    return '';
  }
  return checkpointStore.saveCheckpoint(runtime.runId, snapshotRuntime(runtime));
}

async function runBrowserTaskOrchestrator({
  task,
  states,
  executeStep,
  checkpointStore,
  maxAttemptsPerState = 2,
  initialMetadata = {},
  resumeTerminalState = false
} = {}) {
  if (!task || typeof task !== 'object') {
    throw new Error('task is required');
  }
  if (!Array.isArray(states) || states.length === 0) {
    throw new Error('states are required');
  }
  if (typeof executeStep !== 'function') {
    throw new Error('executeStep is required');
  }

  const runId = buildTaskRunId(task);
  const checkpoint = checkpointStore?.loadCheckpoint
    ? checkpointStore.loadCheckpoint(runId)
    : null;
  const runtime = createTaskRuntime({
    task,
    runId,
    states,
    checkpoint,
    startedAt: new Date().toISOString()
  });
  runtime.metadata = {
    ...runtime.metadata,
    ...initialMetadata
  };
  if (
    resumeTerminalState === true
    && checkpoint
    && runtime.status !== 'done'
    && TERMINAL_TASK_STATUSES.has(runtime.status)
  ) {
    appendObservation(runtime, {
      state: runtime.state,
      type: 'resume',
      data: {
        fromStatus: runtime.status
      }
    });
    runtime.status = 'running';
    runtime.updatedAt = new Date().toISOString();
  }

  await persistRuntime(runtime, checkpointStore);

  while (!TERMINAL_TASK_STATUSES.has(runtime.status)) {
    const state = runtime.state;
    const currentAttempt = Number(runtime.attempts[state] || 0) + 1;
    runtime.attempts[state] = currentAttempt;
    runtime.updatedAt = new Date().toISOString();
    await persistRuntime(runtime, checkpointStore);

    try {
      const outcome = await executeStep({
        task,
        state,
        attempt: currentAttempt,
        runtime: snapshotRuntime(runtime)
      });
      const normalized = outcome && typeof outcome === 'object' ? outcome : {};

      if (normalized.observation) {
        appendObservation(runtime, {
          state,
          type: 'observation',
          data: normalized.observation
        });
      }
      if (normalized.warning) {
        runtime.warnings.push({
          state,
          ...normalized.warning
        });
      }
      if (normalized.metadata && typeof normalized.metadata === 'object') {
        runtime.metadata = {
          ...runtime.metadata,
          ...normalized.metadata
        };
      }
      if (normalized.result !== undefined) {
        runtime.result = normalized.result;
      }

      const status = String(normalized.status || 'success').trim();
      if (status === 'success') {
        advanceToNextState(runtime);
      } else if (status === 'retry') {
        if (currentAttempt >= maxAttemptsPerState) {
          runtime.status = 'need_human';
          runtime.lastError = buildHumanHandoff({
            runtime,
            code: normalized.code || 'retry_exhausted',
            message: normalized.message || `状态 ${state} 已达到最大重试次数`,
            observation: normalized.observation,
            retryable: true
          });
        }
      } else if (status === 'need_human') {
        runtime.status = 'need_human';
        runtime.lastError = buildHumanHandoff({
          runtime,
          code: normalized.code,
          message: normalized.message,
          observation: normalized.observation,
          retryable: Boolean(normalized.retryable)
        });
      } else if (status === 'failed') {
        runtime.status = 'failed';
        runtime.lastError = {
          state,
          code: normalized.code || 'failed',
          message: normalized.message || '任务失败'
        };
      } else {
        runtime.status = 'failed';
        runtime.lastError = {
          state,
          code: 'invalid_step_status',
          message: `Unsupported step status: ${status}`
        };
      }
    } catch (error) {
      const info = classifyTaskError(error);
      appendObservation(runtime, {
        state,
        type: 'error',
        data: {
          code: info.code,
          message: info.message
        }
      });

      if (shouldRequestHumanHandoff({
        errorInfo: info,
        attemptCount: currentAttempt,
        maxAttemptsPerState,
        observation: error?.observation
      })) {
        runtime.status = 'need_human';
        runtime.lastError = buildHumanHandoff({
          runtime,
          code: info.code,
          message: info.message,
          observation: error?.observation,
          retryable: info.retriable
        });
      } else if (info.retriable && currentAttempt < maxAttemptsPerState) {
        runtime.warnings.push({
          state,
          code: info.code,
          message: info.message
        });
      } else {
        runtime.status = 'failed';
        runtime.lastError = {
          state,
          code: info.code,
          message: info.message
        };
      }
    }

    await persistRuntime(runtime, checkpointStore);
  }

  return snapshotRuntime(runtime);
}

module.exports = {
  TERMINAL_TASK_STATUSES,
  advanceToNextState,
  buildHumanHandoff,
  buildTaskRunId,
  createTaskRuntime,
  runBrowserTaskOrchestrator,
  shouldRequestHumanHandoff,
  snapshotRuntime,
  transitionTaskState
};
