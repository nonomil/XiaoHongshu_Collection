const { syncInbox } = require('./lib/inbox_sync');

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
      parsed.limit = Math.max(1, Number(args.shift() || 0) || 0);
      continue;
    }
    if (token.startsWith('--limit=')) {
      parsed.limit = Math.max(1, Number(token.slice('--limit='.length) || 0) || 0);
      continue;
    }

    if (!token.startsWith('--')) {
      if (['latest', 'recent', 'all'].includes(token) && parsed.mode === 'latest') {
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

  if (!['latest', 'recent', 'all'].includes(parsed.mode)) {
    throw new Error(`Unsupported mode: ${parsed.mode}`);
  }

  if (parsed.mode !== 'recent') {
    delete parsed.limit;
  }

  return parsed;
}

async function run(argv = process.argv.slice(2), options = {}) {
  const parsed = options.parsed || parseArgs(argv);
  const syncInboxFn = options.syncInboxFn || syncInbox;
  return syncInboxFn({
    mode: parsed.mode,
    limit: parsed.limit
  });
}

async function main() {
  const result = await run();
  const summary = [
    `Inbox sync complete.`,
    `Mode: ${result.mode}`,
    ...(typeof result.limit === 'number' ? [`Limit: ${result.limit}`] : []),
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
