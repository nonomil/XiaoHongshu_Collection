function resolveNumberEnv(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveDelayMs({ baseMs = 0, jitterMs = 0, rng = Math.random } = {}) {
  const base = Number(baseMs) || 0;
  const jitter = Number(jitterMs) || 0;
  const random = typeof rng === 'function' ? rng() : Math.random();
  const bounded = Number.isFinite(random) ? Math.max(0, Math.min(1, random)) : Math.random();
  return Math.max(0, Math.round(base + jitter * bounded));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryAsync(task, {
  retries = 0,
  baseDelayMs = 0,
  maxDelayMs = 0,
  jitterMs = 0,
  wait = sleep,
  onRetry
} = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      const backoff = baseDelayMs * Math.pow(2, attempt);
      const capped = maxDelayMs ? Math.min(backoff, maxDelayMs) : backoff;
      const delayMs = resolveDelayMs({ baseMs: capped, jitterMs });
      if (typeof onRetry === 'function') {
        onRetry(error, attempt + 1, delayMs);
      }
      if (delayMs > 0) {
        await wait(delayMs);
      }
      attempt += 1;
    }
  }
}

module.exports = {
  resolveNumberEnv,
  resolveDelayMs,
  retryAsync,
  sleep
};
