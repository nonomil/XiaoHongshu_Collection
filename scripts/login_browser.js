const {
  DEFAULT_LAUNCH_URL,
  launchProjectChromeSession
} = require('./lib/browser_session');

function normalizeBrowserChannel(value) {
  const channel = String(value || '').trim();
  if (!channel) return '';
  if (channel === 'stable' || channel === 'beta' || channel === 'canary') {
    return channel;
  }
  throw new Error('Unsupported browser channel: expected stable, beta, or canary');
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.filter(Boolean) : [];
  const browser = {};
  let url = DEFAULT_LAUNCH_URL;

  const readOptionValue = (label, index) => {
    const next = args[index + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for ${label}`);
    }
    return next;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--browser-channel') {
      browser.channel = normalizeBrowserChannel(readOptionValue(arg, index));
      index += 1;
      continue;
    }
    if (arg.startsWith('--browser-channel=')) {
      browser.channel = normalizeBrowserChannel(arg.slice('--browser-channel='.length));
      continue;
    }
    if (arg === '--url') {
      url = String(readOptionValue(arg, index) || '').trim() || DEFAULT_LAUNCH_URL;
      index += 1;
      continue;
    }
    if (arg.startsWith('--url=')) {
      url = String(arg.slice('--url='.length) || '').trim() || DEFAULT_LAUNCH_URL;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unsupported option: ${arg}`);
    }
    url = String(arg || '').trim() || DEFAULT_LAUNCH_URL;
  }

  const parsed = { url };
  if (Object.keys(browser).length > 0) {
    parsed.browser = browser;
  }
  return parsed;
}

function buildLoginInstructions({ profileDir, debugUrl, url, pid }) {
  return [
    'Project login browser is ready.',
    `Profile: ${profileDir}`,
    `Debug URL: ${debugUrl}`,
    `Opened URL: ${url}`,
    `PID: ${pid || 0}`,
    'Log in once in this browser, then close the browser window when you are done.',
    'Later save runs can reuse this same profile, including background headless mode.'
  ].join('\n');
}

async function launchLoginBrowser(options = {}) {
  const result = await launchProjectChromeSession({
    url: options.url || DEFAULT_LAUNCH_URL,
    browser: {
      channel: options.browser?.channel || '',
      headless: false
    }
  });

  return {
    ...result,
    instructions: buildLoginInstructions(result)
  };
}

async function run(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  return launchLoginBrowser(parsed);
}

if (require.main === module) {
  run()
    .then((result) => {
      console.log(result.instructions);
    })
    .catch((error) => {
      console.error(`Open login browser failed: ${error.message || error}`);
      process.exitCode = 1;
    });
}

module.exports = {
  buildLoginInstructions,
  launchLoginBrowser,
  parseArgs,
  run
};
