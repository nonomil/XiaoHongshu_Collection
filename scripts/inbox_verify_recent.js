const path = require('path');

const { resolveProjectPaths } = require('./lib/config');
const { loadPushbulletConfig } = require('./lib/pushbullet_config');
const { resolveInboxPath } = require('./lib/inbox_sync');
const { verifyRecentInboxCopies } = require('./lib/inbox_verify');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..'));
const DEFAULT_PUSHBULLET_CONFIG_PATH = path.join(PATHS.configDir, 'pushbullet.json');
const DEFAULT_OUTPUT_ROOT = path.join(PATHS.outputDir, '收件箱同步');

function parseArgs(argv = []) {
  const args = [...argv];
  const parsed = {
    limit: 50
  };
  let has_explicit_limit = false;

  while (args.length > 0) {
    const token = args.shift();
    if (!token) continue;

    if (token === '--limit') {
      parsed.limit = Math.max(1, Number(args.shift() || 50) || 50);
      has_explicit_limit = true;
      continue;
    }
    if (token.startsWith('--limit=')) {
      parsed.limit = Math.max(1, Number(token.slice('--limit='.length) || 50) || 50);
      has_explicit_limit = true;
      continue;
    }
    if (token === '--output-root') {
      parsed.outputRoot = String(args.shift() || '').trim();
      continue;
    }
    if (token.startsWith('--output-root=')) {
      parsed.outputRoot = String(token.slice('--output-root='.length) || '').trim();
      continue;
    }

    if (!token.startsWith('--')) {
      if (Number.isFinite(Number(token)) && Number(token) > 0 && !has_explicit_limit) {
        parsed.limit = Math.max(1, Math.trunc(Number(token)));
        has_explicit_limit = true;
        continue;
      }
      if (!parsed.outputRoot) {
        parsed.outputRoot = String(token).trim();
        continue;
      }
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return parsed;
}

async function run(argv = process.argv.slice(2), options = {}) {
  const parsed = options.parsed || parseArgs(argv);
  const pushbulletConfigPath = options.pushbulletConfigPath || DEFAULT_PUSHBULLET_CONFIG_PATH;
  const config = loadPushbulletConfig({ configPath: pushbulletConfigPath });
  const inboxPath = options.inboxPath || resolveInboxPath(PATHS.projectDir, config.inboxPath);
  const outputRoot = parsed.outputRoot || options.outputRoot || DEFAULT_OUTPUT_ROOT;
  const verifyRecentInboxCopiesFn = options.verifyRecentInboxCopiesFn || verifyRecentInboxCopies;

  return verifyRecentInboxCopiesFn({
    inboxPath,
    outputRoot,
    limit: parsed.limit
  });
}

if (require.main === module) {
  run()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error && error.message ? error.message : 'Inbox verification failed.');
      process.exitCode = 1;
    });
}

module.exports = {
  parseArgs,
  run
};
