function normalizeError(error) {
  if (!error) return new Error('Unknown pipeline error');
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function buildWarning(step, error) {
  const normalized = normalizeError(error);
  return {
    step,
    message: normalized.message || String(normalized)
  };
}

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
        const normalized = normalizeError(err);
        const allowWrite = !!normalized.allowWrite || !!err?.allowWrite;
        steps.enrich = { ok: false, error: normalized, allowWrite };
        warnings.push(buildWarning('enrich', normalized));
        if (!allowWrite) {
          error = normalized;
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
        const normalized = normalizeError(err);
        steps.write = { ok: false, error: normalized };
        error = normalized;
      }
    }
  } catch (err) {
    const normalized = normalizeError(err);
    if (!steps.fetch) {
      steps.fetch = { ok: false, error: normalized };
    }
    error = normalized;
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
