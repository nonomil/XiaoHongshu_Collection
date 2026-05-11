const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadOpenRouterConfig } = require('./lib/config');

const source_root = path.resolve(__dirname, '..');
const default_release_root = path.join(source_root, 'Release');
const default_copy_dirs = ['scripts', 'ui', 'assets'];
const default_config_examples = [
  'ingress.example.json',
  'openrouter.example.json',
  'vision-ocr.example.json'
];

function normalize_relative_path(value) {
  return String(value || '').split(path.sep).join('/');
}

function ensure_dir(dir_path) {
  fs.mkdirSync(dir_path, { recursive: true });
}

function write_utf8_json(file_path, payload) {
  ensure_dir(path.dirname(file_path));
  fs.writeFileSync(file_path, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

function write_ascii_text(file_path, content) {
  ensure_dir(path.dirname(file_path));
  fs.writeFileSync(file_path, content, 'ascii');
}

function write_utf8_text(file_path, content) {
  ensure_dir(path.dirname(file_path));
  fs.writeFileSync(file_path, content, 'utf-8');
}

function should_copy_runtime_path({
  source_root: current_source_root,
  source_path
}) {
  const relative_path = normalize_relative_path(path.relative(current_source_root, source_path));
  if (!relative_path) return true;
  if (relative_path === 'scripts/ai/__tests__' || relative_path.startsWith('scripts/ai/__tests__/')) {
    return false;
  }
  if (relative_path === 'scripts/ai/__tmp__' || relative_path.startsWith('scripts/ai/__tmp__/')) {
    return false;
  }
  if (relative_path === 'Release' || relative_path.startsWith('Release/')) {
    return false;
  }
  return true;
}

function copy_runtime_dir({
  source_root: current_source_root,
  release_root,
  relative_dir
}) {
  const source_dir = path.join(current_source_root, relative_dir);
  const target_dir = path.join(release_root, relative_dir);
  if (!fs.existsSync(source_dir)) return;
  fs.cpSync(source_dir, target_dir, {
    recursive: true,
    force: true,
    filter: (source_path) => should_copy_runtime_path({
      source_root: current_source_root,
      source_path: path.resolve(source_path)
    })
  });
}

function copy_runtime_node_modules({
  source_root: current_source_root,
  release_root
}) {
  const source_dir = path.join(current_source_root, 'node_modules');
  const target_dir = path.join(release_root, 'node_modules');
  if (!fs.existsSync(source_dir)) {
    throw new Error('缺少 node_modules，无法构建独立运行版');
  }
  fs.cpSync(source_dir, target_dir, {
    recursive: true,
    force: true
  });
}

function prune_release_node_modules(release_root) {
  const prune_args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm prune --omit=dev']
    : ['prune', '--omit=dev'];
  const prune_command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
  const result = spawnSync(prune_command, prune_args, {
    cwd: release_root,
    stdio: 'inherit'
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`npm prune --omit=dev failed with code ${result.status}`);
  }
}

function build_release_package_json() {
  return {
    name: 'xiaohongshu-collection-release',
    private: true,
    description: '最小可运行的本地归档工作台发布目录',
    scripts: {
      ui: 'node scripts/ui_server.js',
      'save-note': 'node scripts/save_note.js',
      'zhihu:favorites': 'node scripts/save_zhihu_favorites.js',
      'inbox:sync': 'node scripts/inbox_sync.js',
      'inbox:save': 'node scripts/inbox_save.js'
    },
    dependencies: {
      'tesseract.js': '^7.0.0',
      ws: '^8.19.0'
    }
  };
}

function build_release_ui_config() {
  return {
    paths: {
      saveLinksOutputRoot: '',
      saveLinksImagesRoot: '',
      collectionOutputRoot: '',
      collectionRawPath: ''
    },
    browser: {
      mode: 'current-browser',
      browserUrl: '',
      wsEndpoint: '',
      channel: 'stable',
      headless: false
    },
    naming: {
      conflictStrategy: 'overwrite',
      maxTitleLength: 80
    },
    runtime: {
      autoClassifyLinksEnabled: true,
      aiSummaryEnabled: true,
      visionOcrEnabled: true,
      ocrFallbackEnabled: true,
      openRouterBaseUrl: '',
      openRouterModel: '',
      hasOpenRouterApiKey: false,
      openRouterTimeoutMs: 30000,
      visionOcrTimeoutMs: 60000,
      maxImagesPerNote: 12
    },
    ingress: {
      localBaseUrl: 'http://127.0.0.1:3030',
      cloudBaseUrl: '',
      defaultRoute: 'local'
    },
    inbox: {
      categories: {}
    },
    ui: {
      showRawReport: true
    }
  };
}

function build_release_openrouter_config(current_source_root) {
  const loaded = loadOpenRouterConfig({
    projectDir: current_source_root,
    configPath: path.join(current_source_root, 'config', 'openrouter.json')
  });
  return {
    enabled: loaded.enabled !== false,
    apiKey: '',
    model: String(loaded.model || 'openrouter/free').trim() || 'openrouter/free',
    baseUrl: String(loaded.baseUrl || 'https://openrouter.ai/api/v1').trim() || 'https://openrouter.ai/api/v1',
    timeoutMs: Number(loaded.timeoutMs || 30000) || 30000
  };
}

function build_release_vision_config() {
  return {
    enabled: false,
    baseUrl: '',
    apiKey: '',
    model: '',
    timeoutMs: 60000,
    fallbackToTesseract: true
  };
}

function build_release_pushbullet_config() {
  return {
    enabled: false,
    accessToken: '',
    lastModified: 0,
    inboxPath: 'data/inbox_links.jsonl',
    maxPages: 50,
    bootstrapMaxPages: 200,
    pageLimit: 500
  };
}

function build_start_ui_bat() {
  return [
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    '',
    'where node >nul 2>nul',
    'if errorlevel 1 (',
    '  echo Node.js not found in PATH.',
    '  pause',
    '  exit /b 1',
    ')',
    '',
    'if not exist output mkdir output',
    'if not exist output\\_images mkdir output\\_images',
    'if not exist data mkdir data',
    'if not exist .cache mkdir .cache',
    'if not exist config mkdir config',
    '',
    'if "%XHS_UI_PORT%"=="" (',
    '  for /f %%i in (\'powershell -NoProfile -Command "$port=3030; while($port -le 3050){ try { $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port); $listener.Start(); $listener.Stop(); Write-Output $port; break } catch { $port++ } }"\') do set XHS_UI_PORT=%%i',
    ')',
    'if "%XHS_UI_PORT%"=="" set XHS_UI_PORT=3030',
    'echo Using port %XHS_UI_PORT%',
    'start "XHS Release UI" cmd /k "cd /d ""%~dp0"" && set XHS_UI_PORT=%XHS_UI_PORT% && node scripts\\ui_server.js"',
    'timeout /t 2 /nobreak >nul',
    'start "" "http://127.0.0.1:%XHS_UI_PORT%/"',
    'exit /b 0',
    ''
  ].join('\r\n');
}

function build_release_readme() {
  return [
    '# 最小运行版',
    '',
    '这个目录是从主项目裁出来的最小可运行版本，目标是直接双击启动 UI，不依赖仓库根目录。',
    '',
    '## 已包含',
    '',
    '- `scripts/`：运行 UI、链接保存、收件箱、知乎收藏夹所需脚本',
    '- `ui/`：前端页面与样式',
    '- `assets/tesseract/`：Tesseract 识别资源',
    '- `config/`：发布版默认配置（已做脱敏）',
    '- `node_modules/`：运行所需依赖',
    '',
    '## 启动',
    '',
    '1. 确认本机已安装 Node.js',
    '2. 双击 `start_ui.bat`',
    '3. 浏览器会自动打开本地 UI 地址，默认优先使用 `3030`，端口冲突时会自动换到空闲端口',
    '',
    '## 首次使用建议',
    '',
    '1. 先在设置里填写 AI API 地址 / Key / 模型，并点击“测试 AI API”',
    '2. 再点击“打开项目登录浏览器”，登录小红书',
    '3. 然后再执行链接保存、收藏同步或收件箱解析',
    '',
    '## 目录说明',
    '',
    '- `output/`：保存产物',
    '- `data/`：收件箱与中间数据',
    '- `.cache/`：浏览器和运行缓存',
    '',
    '## 配置说明',
    '',
    '- `config/openrouter.json` 已脱敏，默认不会带出原仓库里的真实 Key',
    '- `config/pushbullet.json` 默认关闭，需要时再在 UI 里配置',
    '- `config/ui.json` 使用发布版默认值，输出目录默认落在本目录下',
    ''
  ].join('\n');
}

function copy_config_examples({
  source_root: current_source_root,
  release_root
}) {
  const source_config_dir = path.join(current_source_root, 'config');
  const target_config_dir = path.join(release_root, 'config');
  ensure_dir(target_config_dir);
  for (const filename of default_config_examples) {
    const source_file = path.join(source_config_dir, filename);
    const target_file = path.join(target_config_dir, filename);
    if (fs.existsSync(source_file)) {
      fs.cpSync(source_file, target_file, { force: true });
    }
  }
}

function ensure_runtime_dirs(release_root) {
  ensure_dir(path.join(release_root, 'output'));
  ensure_dir(path.join(release_root, 'output', '_images'));
  ensure_dir(path.join(release_root, 'data'));
  ensure_dir(path.join(release_root, '.cache'));
  ensure_dir(path.join(release_root, 'config'));
}

function build_release_minimal(options = {}) {
  const current_source_root = path.resolve(options.source_root || source_root);
  const release_root = path.resolve(options.release_root || default_release_root);
  const include_node_modules = options.include_node_modules !== false;
  // 默认优先保证构建稳定，裁剪依赖改成显式开启。
  const prune_node_modules = options.prune_node_modules === true;

  ensure_dir(release_root);
  ensure_runtime_dirs(release_root);

  for (const relative_dir of default_copy_dirs) {
    copy_runtime_dir({
      source_root: current_source_root,
      release_root,
      relative_dir
    });
  }

  copy_config_examples({
    source_root: current_source_root,
    release_root
  });

  write_utf8_json(path.join(release_root, 'package.json'), build_release_package_json());
  write_utf8_json(path.join(release_root, 'config', 'ui.json'), build_release_ui_config());
  write_utf8_json(
    path.join(release_root, 'config', 'openrouter.json'),
    build_release_openrouter_config(current_source_root)
  );
  write_utf8_json(path.join(release_root, 'config', 'vision-ocr.json'), build_release_vision_config());
  write_utf8_json(path.join(release_root, 'config', 'pushbullet.json'), build_release_pushbullet_config());
  write_ascii_text(path.join(release_root, 'start_ui.bat'), build_start_ui_bat());
  write_utf8_text(path.join(release_root, 'README_最小运行版.md'), build_release_readme());

  if (include_node_modules) {
    copy_runtime_node_modules({
      source_root: current_source_root,
      release_root
    });
    if (prune_node_modules) {
      prune_release_node_modules(release_root);
    }
  }

  return {
    release_root,
    include_node_modules,
    prune_node_modules
  };
}

if (require.main === module) {
  const should_prune_node_modules = process.argv.includes('--prune-node-modules');
  const result = build_release_minimal({
    prune_node_modules: should_prune_node_modules
  });
  console.log(`Release ready: ${result.release_root}`);
}

module.exports = {
  build_release_minimal,
  build_release_openrouter_config,
  build_release_package_json,
  build_release_pushbullet_config,
  build_release_readme,
  build_release_ui_config,
  build_release_vision_config,
  build_start_ui_bat,
  should_copy_runtime_path
};
