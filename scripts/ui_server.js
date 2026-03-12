const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { saveLinksText } = require('./save_note');
const {
  assertValidTask,
  buildCollectionTask,
  buildNoteSaveTask
} = require('./lib/task');

const PROJECT_DIR = path.resolve(__dirname, '..');
const UI_DIR = path.join(PROJECT_DIR, 'ui');
const DEFAULT_PORT = Number(process.env.XHS_UI_PORT || 3030);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';

    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    request.on('error', reject);
  });
}

function getContentType(filepath) {
  switch (path.extname(filepath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'text/plain; charset=utf-8';
  }
}

function resolveStaticFile(urlPathname, uiDir = UI_DIR) {
  const requestPath = urlPathname === '/' ? '/index.html' : urlPathname;
  const normalized = path.normalize(requestPath).replace(/^(\.\.[\\/])+/, '');
  const filepath = path.join(uiDir, normalized);

  if (!filepath.startsWith(path.resolve(uiDir))) {
    return '';
  }

  if (!fs.existsSync(filepath) || fs.statSync(filepath).isDirectory()) {
    return '';
  }

  return filepath;
}

function serveStatic(request, response, uiDir = UI_DIR) {
  const url = new URL(request.url, 'http://127.0.0.1');
  const filepath = resolveStaticFile(url.pathname, uiDir);

  if (!filepath) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
    return;
  }

  response.writeHead(200, { 'Content-Type': getContentType(filepath) });
  fs.createReadStream(filepath).pipe(response);
}

function runNodeScript(scriptRelativePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(PROJECT_DIR, scriptRelativePath)], {
      cwd: PROJECT_DIR,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      const logs = `${stdout}${stderr}`
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (code !== 0) {
        const error = new Error(`Script failed: ${scriptRelativePath}`);
        error.code = code;
        error.logs = logs;
        reject(error);
        return;
      }

      resolve({
        script: path.basename(scriptRelativePath),
        code,
        logs
      });
    });
  });
}

async function runCollectionExport(task) {
  if (task) {
    assertValidTask(task);
  }
  const steps = [];
  const logs = [];

  for (const script of ['scripts/extract_v4.js', 'scripts/ocr_and_write.js']) {
    const result = await runNodeScript(script);
    steps.push({ script: result.script, code: result.code });
    logs.push(...result.logs);
  }

  return { steps, logs };
}

function createUiServer({
  saveLinksText: saveLinks = saveLinksText,
  runCollectionExport: runCollection = runCollectionExport,
  uiDir = UI_DIR
} = {}) {
  let activeTask = '';

  async function runExclusive(taskName, task) {
    if (activeTask) {
      const error = new Error(`已有任务正在运行中：${activeTask}`);
      error.statusCode = 409;
      throw error;
    }

    activeTask = taskName;
    try {
      return await task();
    } finally {
      activeTask = '';
    }
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');

      if (request.method === 'GET') {
        serveStatic(request, response, uiDir);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/save-links') {
        const payload = await readJsonBody(request);
        const text = String(payload.text || '').trim();
        if (!text) {
          sendJson(response, 400, {
            ok: false,
            error: '请输入包含小红书链接的文本'
          });
          return;
        }

        const task = buildNoteSaveTask({ input: text, source: 'ui' });
        assertValidTask(task);
        const summary = await runExclusive('save-links', () => saveLinks(text, { task, source: 'ui' }));
        sendJson(response, 200, {
          ok: true,
          task: 'save-links',
          summary: {
            total: summary.total || 0,
            successCount: summary.successCount || 0,
            failureCount: summary.failureCount || 0
          },
          results: Array.isArray(summary.results) ? summary.results : []
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/save-collection') {
        const task = buildCollectionTask({ source: 'ui' });
        assertValidTask(task);
        const result = await runExclusive('save-collection', () => runCollection(task));
        sendJson(response, 200, {
          ok: true,
          task: 'save-collection',
          result
        });
        return;
      }

      sendJson(response, 404, {
        ok: false,
        error: 'Not Found'
      });
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        ok: false,
        error: error.message || 'Internal Server Error'
      });
    }
  });
}

function startUiServer(port = DEFAULT_PORT, options = {}) {
  const server = createUiServer(options);
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (require.main === module) {
  startUiServer()
    .then((server) => {
      const address = server.address();
      console.log(`UI server running at http://127.0.0.1:${address.port}`);
    })
    .catch((error) => {
      console.error(`UI server failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_PORT,
  createUiServer,
  readJsonBody,
  resolveStaticFile,
  runCollectionExport,
  runNodeScript,
  sendJson,
  startUiServer
};
