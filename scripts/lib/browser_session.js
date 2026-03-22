const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const { resolveProjectPaths } = require('./config');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..', '..'));
const CHROME_DEBUG_PORT = 9222;
const DEFAULT_LAUNCH_URL = 'https://www.xiaohongshu.com/explore';
const DEFAULT_PROJECT_PROFILE_DIR = path.join(PATHS.cacheDir, 'chrome-debug');

const CHROME_EXECUTABLES = {
  stable: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ],
  beta: [
    'C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome Beta\\Application\\chrome.exe'
  ],
  canary: [
    'C:\\Users\\%USERNAME%\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome SxS\\Application\\chrome.exe'
  ],
  edge: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ]
};

function expandWindowsEnv(filepath, env = process.env) {
  return String(filepath || '').replace(/%([A-Z0-9_]+)%/gi, (_, key) => String(env[key] || ''));
}

function listChromeExecutableCandidates(channel) {
  const preferred = [];
  if (channel && CHROME_EXECUTABLES[channel]) {
    preferred.push(...CHROME_EXECUTABLES[channel]);
  }

  return [
    ...preferred,
    ...CHROME_EXECUTABLES.stable,
    ...CHROME_EXECUTABLES.beta,
    ...CHROME_EXECUTABLES.canary,
    ...CHROME_EXECUTABLES.edge
  ];
}

function findChromeExecutable({ channel, existsSync = fs.existsSync, env = process.env } = {}) {
  const candidates = listChromeExecutableCandidates(channel);
  for (const candidate of candidates) {
    const resolved = expandWindowsEnv(candidate, env);
    if (resolved && existsSync(resolved)) {
      return resolved;
    }
  }
  return '';
}

function buildProjectChromeLaunchArgs({
  debugPort = CHROME_DEBUG_PORT,
  userDataDir = DEFAULT_PROJECT_PROFILE_DIR,
  url = DEFAULT_LAUNCH_URL,
  headless = false
} = {}) {
  const args = [
    `--remote-debugging-port=${debugPort}`,
    '--no-first-run',
    '--no-default-browser-check'
  ];

  if (headless) {
    args.push('--headless=new', '--disable-gpu');
  } else {
    args.push('--new-window');
  }

  args.push(`--user-data-dir=${userDataDir}`);
  if (url) {
    args.push(url);
  }

  return args;
}

function waitForChromeDebugPort({
  debugPort = CHROME_DEBUG_PORT,
  attempts = 20,
  intervalMs = 500
} = {}) {
  const targetUrl = `http://127.0.0.1:${debugPort}/json`;
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryConnect = () => {
      attempt += 1;
      const req = http.get(targetUrl, (res) => {
        res.resume();
        resolve(true);
      });

      req.on('error', (error) => {
        if (attempt >= attempts) {
          reject(error);
          return;
        }
        setTimeout(tryConnect, intervalMs);
      });
    };

    tryConnect();
  });
}

async function launchProjectChromeSession({
  url = DEFAULT_LAUNCH_URL,
  browser = {},
  channel = browser.channel,
  headless = browser.headless === true,
  debugPort = CHROME_DEBUG_PORT,
  userDataDir = DEFAULT_PROJECT_PROFILE_DIR,
  spawnFn = spawn,
  mkdirSync = fs.mkdirSync,
  findChromeExecutableFn = findChromeExecutable,
  waitForDebugPortFn = waitForChromeDebugPort
} = {}) {
  const chromePath = findChromeExecutableFn({ channel });
  if (!chromePath) {
    throw new Error('Chrome executable not found');
  }

  mkdirSync(userDataDir, { recursive: true });
  const args = buildProjectChromeLaunchArgs({
    debugPort,
    userDataDir,
    url,
    headless
  });
  const child = spawnFn(chromePath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  if (typeof child.unref === 'function') {
    child.unref();
  }

  await waitForDebugPortFn({ debugPort });
  return {
    pid: Number(child.pid || 0) || 0,
    chromePath,
    profileDir: userDataDir,
    userDataDir,
    url,
    headless,
    debugPort,
    debugUrl: `http://127.0.0.1:${debugPort}/json`
  };
}

module.exports = {
  CHROME_DEBUG_PORT,
  DEFAULT_LAUNCH_URL,
  DEFAULT_PROJECT_PROFILE_DIR,
  buildProjectChromeLaunchArgs,
  findChromeExecutable,
  launchProjectChromeSession,
  waitForChromeDebugPort
};
