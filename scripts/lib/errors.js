class CodexTaskError extends Error {
  constructor(code, message, options = {}) {
    super(message || code);
    this.name = 'CodexTaskError';
    this.code = code || 'unknown';
    this.retriable = Boolean(options.retriable);
    this.allowWrite = Boolean(options.allowWrite);
    this.allowFallback = Boolean(options.allowFallback);
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

function extractErrorMessages(error) {
  const messages = [];
  const direct = String(error && error.message ? error.message : '').trim();
  if (direct) messages.push(direct);

  if (Array.isArray(error?.errors)) {
    for (const item of error.errors) {
      const nested = String(item && item.message ? item.message : '').trim();
      if (nested) messages.push(nested);
    }
  }

  if (error?.cause && error.cause !== error) {
    const cause = String(error.cause.message || error.cause).trim();
    if (cause) messages.push(cause);
  }

  if (error?.code && !messages.some((item) => item.includes(error.code))) {
    messages.unshift(String(error.code));
  }

  return Array.from(new Set(messages.filter(Boolean)));
}

function classifyTaskError(error) {
  if (error instanceof CodexTaskError) {
    return {
      code: error.code,
      message: error.message,
      retriable: Boolean(error.retriable),
      allowWrite: Boolean(error.allowWrite),
      allowFallback: Boolean(error.allowFallback),
      error
    };
  }

  const messages = extractErrorMessages(error);
  const message = messages.join('; ').trim();
  const normalized = error instanceof Error ? error : new Error(message || 'Unknown error');
  const lower = message.toLowerCase();

  let code = 'unknown';
  let retriable = Boolean(error?.retriable);
  let allowWrite = Boolean(error?.allowWrite);
  let allowFallback = Boolean(error?.allowFallback);

  if (/ECONNREFUSED|connect ECONNREFUSED|socket hang up|ECONNRESET/i.test(message)) {
    code = 'chrome_unavailable';
    retriable = true;
  } else if (/No xiaohongshu tab found/i.test(message)) {
    code = 'no_xiaohongshu_tab';
  } else if (/Current tab is not a Xiaohongshu note detail page/i.test(message)) {
    code = 'not_note_detail';
  } else if (/comment.*(fail|error|failed)/i.test(message)) {
    code = 'comment_fetch_failed';
    allowWrite = true;
    allowFallback = true;
  } else if (/vision ocr|ocr returned empty|ocr failed/i.test(lower)) {
    code = 'vision_ocr_failed';
    allowWrite = true;
    allowFallback = true;
  } else if (/openrouter|ai.*failed|summary.*failed|openrouter empty response/i.test(lower)) {
    code = 'ai_failed';
    allowWrite = true;
    allowFallback = true;
  }

  return {
    code,
    message: message || normalized.message,
    retriable,
    allowWrite,
    allowFallback,
    error: normalized
  };
}

function isRetriableTaskError(error) {
  return Boolean(classifyTaskError(error).retriable);
}

function buildTaskWarning({ step, error }) {
  const info = error && error.code && error.message
    ? error
    : classifyTaskError(error);
  return {
    step,
    code: info.code,
    message: info.message
  };
}

module.exports = {
  CodexTaskError,
  buildTaskWarning,
  classifyTaskError,
  isRetriableTaskError
};
