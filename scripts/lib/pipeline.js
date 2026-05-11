const { classifyTaskError, buildTaskWarning } = require('./errors');

async function runTaskPipeline({
  task,
  fetchFn,
  enrichFn,
  writeFn,
  reportFn
} = {}) {
  const stepOrder = ['input'];
  const warnings = [];
  const steps = {
    input: { ok: true, data: task }
  };

  let error = null;

  try {
    if (typeof fetchFn !== 'function') {
      throw new Error('fetchFn is required');
    }

    stepOrder.push('fetch');
    const fetched = await fetchFn(task);
    steps.fetch = { ok: true, data: fetched };

    stepOrder.push('enrich');
    if (typeof enrichFn === 'function') {
      try {
        const enriched = await enrichFn(fetched, task);
        steps.enrich = { ok: true, data: enriched };
      } catch (err) {
        const info = classifyTaskError(err);
        const allowWrite = !!info.allowWrite;
        steps.enrich = { ok: false, error: info.error, code: info.code, allowWrite };
        warnings.push(buildTaskWarning({ step: 'enrich', error: info }));
        if (!allowWrite) {
          error = info.error;
        }
      }
    } else {
      steps.enrich = { ok: true, data: fetched };
    }

    if (!error) {
      stepOrder.push('write');
      if (typeof writeFn !== 'function') {
        throw new Error('writeFn is required');
      }

      const inputForWrite = steps.enrich.ok ? steps.enrich.data : steps.fetch.data;
      try {
        const written = await writeFn(inputForWrite, task);
        steps.write = { ok: true, data: written };
      } catch (err) {
        const info = classifyTaskError(err);
        steps.write = { ok: false, error: info.error, code: info.code };
        error = info.error;
      }
    }
  } catch (err) {
    const info = classifyTaskError(err);
    if (!steps.fetch) {
      steps.fetch = { ok: false, error: info.error, code: info.code };
    }
    error = info.error;
  }

  stepOrder.push('report');

  const ok = !error;
  const payload = {
    ok,
    task,
    steps,
    warnings,
    error
  };

  const report = typeof reportFn === 'function' ? await reportFn(payload) : null;

  return {
    ...payload,
    report,
    stepOrder
  };
}

module.exports = {
  runTaskPipeline
};
