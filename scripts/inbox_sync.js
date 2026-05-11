const { syncInbox } = require('./lib/inbox_sync');

function resolve_positive_integer(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.trunc(num);
}

function parseArgs(argv = []) {
  const args = [...argv];
  const parsed = {
    mode: 'latest'
  };

  while (args.length > 0) {
    const token = args.shift();
    if (!token) continue;

    if (token === '--mode') {
      parsed.mode = String(args.shift() || '').trim() || 'latest';
      continue;
    }
    if (token.startsWith('--mode=')) {
      parsed.mode = String(token.slice('--mode='.length) || '').trim() || 'latest';
      continue;
    }
    if (token === '--limit') {
      parsed.limit = resolve_positive_integer(args.shift());
      continue;
    }
    if (token.startsWith('--limit=')) {
      parsed.limit = resolve_positive_integer(token.slice('--limit='.length));
      continue;
    }
    if (token === '--max-pages') {
      parsed.maxPages = resolve_positive_integer(args.shift());
      continue;
    }
    if (token.startsWith('--max-pages=')) {
      parsed.maxPages = resolve_positive_integer(token.slice('--max-pages='.length));
      continue;
    }
    if (token === '--preset') {
      parsed.preset = String(args.shift() || '').trim().toLowerCase();
      continue;
    }
    if (token.startsWith('--preset=')) {
      parsed.preset = String(token.slice('--preset='.length) || '').trim().toLowerCase();
      continue;
    }
    if (token === '--value') {
      parsed.value = resolve_positive_integer(args.shift());
      continue;
    }
    if (token.startsWith('--value=')) {
      parsed.value = resolve_positive_integer(token.slice('--value='.length));
      continue;
    }
    if (token === '--unit') {
      parsed.unit = String(args.shift() || '').trim().toLowerCase();
      continue;
    }
    if (token.startsWith('--unit=')) {
      parsed.unit = String(token.slice('--unit='.length) || '').trim().toLowerCase();
      continue;
    }

    if (!token.startsWith('--')) {
      if (['latest', 'recent', 'all', 'bootstrap', 'window'].includes(token) && parsed.mode === 'latest') {
        parsed.mode = token;
        continue;
      }
      if (Number.isFinite(Number(token)) && Number(token) > 0 && typeof parsed.limit !== 'number') {
        parsed.limit = Math.max(1, Math.trunc(Number(token)));
        continue;
      }
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!['latest', 'recent', 'all', 'bootstrap', 'window'].includes(parsed.mode)) {
    throw new Error(`Unsupported mode: ${parsed.mode}`);
  }

  if (parsed.mode !== 'recent') {
    delete parsed.limit;
  }
  if (parsed.mode === 'window') {
    const has_preset = typeof parsed.preset === 'string' && parsed.preset.length > 0;
    const has_custom = typeof parsed.value === 'number' && parsed.value > 0;
    if (has_preset && has_custom) {
      throw new Error('Window mode accepts either --preset or --value with --unit.');
    }
    if (has_preset) {
      if (!['today', '7d', '30d', '60d', '2m'].includes(parsed.preset)) {
        throw new Error(`Unsupported preset: ${parsed.preset}`);
      }
      parsed.timeWindow = { preset: parsed.preset };
    } else if (has_custom) {
      if (!['day', 'month', 'year'].includes(parsed.unit)) {
        throw new Error(`Unsupported unit: ${parsed.unit}`);
      }
      parsed.timeWindow = {
        value: parsed.value,
        unit: parsed.unit
      };
    } else {
      throw new Error('Window mode requires --preset or --value with --unit.');
    }
  }

  delete parsed.preset;
  delete parsed.value;
  delete parsed.unit;

  return parsed;
}

async function run(argv = process.argv.slice(2), options = {}) {
  const parsed = options.parsed || parseArgs(argv);
  const syncInboxFn = options.syncInboxFn || syncInbox;
  return syncInboxFn({
    mode: parsed.mode,
    limit: parsed.limit,
    timeWindow: parsed.timeWindow,
    maxPages: parsed.maxPages
  });
}

async function main() {
  const result = await run();
  const summary = [
    `Inbox sync complete.`,
    `Mode: ${result.mode}`,
    ...(typeof result.limit === 'number' ? [`Limit: ${result.limit}`] : []),
    ...(result.windowLabel ? [`Window: ${result.windowLabel}`] : []),
    ...(typeof result.maxPages === 'number' ? [`MaxPages: ${result.maxPages}`] : []),
    `Added: ${result.added}`,
    `Skipped: ${result.skipped}`,
    `Total: ${result.total}`
  ].join(' ');
  console.log(summary);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : 'Inbox sync failed.');
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  run
};
