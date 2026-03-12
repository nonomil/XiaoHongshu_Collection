function buildTaskResult({
  status = 'success',
  task,
  output,
  error,
  warnings = []
} = {}) {
  return {
    status,
    task,
    output,
    error,
    warnings: Array.isArray(warnings) ? warnings : []
  };
}

function mergeTaskWarnings(warningsList = []) {
  const flat = warningsList
    .flat()
    .filter(Boolean);
  const seen = new Set();
  const merged = [];

  for (const warning of flat) {
    const key = `${warning.code || ''}|${warning.message || ''}|${warning.step || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(warning);
  }

  return merged;
}

function buildTaskSummary(results = [], { includeWarnings = false } = {}) {
  const list = Array.isArray(results) ? results : [];
  const successCount = list.filter((item) => item.status === 'success').length;
  const failureCount = list.filter((item) => item.status === 'failed').length;
  const summary = {
    total: list.length,
    successCount,
    failureCount,
    results: list
  };

  if (includeWarnings) {
    summary.warnings = mergeTaskWarnings(list.map((item) => item.warnings || []));
  }

  return summary;
}

module.exports = {
  buildTaskResult,
  buildTaskSummary,
  mergeTaskWarnings
};
