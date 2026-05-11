const LOCAL_BASE_URL = 'http://127.0.0.1:3030';
const WORKBENCH_URL = `${LOCAL_BASE_URL}/`;

const state = {
  tab: null
};

function $(id) {
  return document.getElementById(id);
}

function set_status(message, type = '') {
  const status = $('status');
  status.textContent = message;
  status.className = type ? `status ${type}` : 'status';
}

function set_actions_enabled(enabled) {
  $('save-local').disabled = !enabled;
  $('enqueue-local').disabled = !enabled;
}

function build_metadata(tab) {
  return {
    page_title: String(tab?.title || '').trim(),
    tab_id: Number(tab?.id || 0) || 0
  };
}

async function get_current_tab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length > 0 ? tabs[0] : null;
}

async function post_json(pathname, payload) {
  const response = await fetch(`${LOCAL_BASE_URL}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return body;
}

function render_tab(tab) {
  state.tab = tab;
  const title = String(tab?.title || '').trim();
  const url = String(tab?.url || '').trim();

  $('page-title').textContent = title || '未读取到页面标题';
  $('page-url').textContent = url || '当前标签页没有可发送的 URL';
  set_actions_enabled(Boolean(url));
}

async function refresh_tab() {
  set_status('正在读取当前标签页…');
  const tab = await get_current_tab();
  render_tab(tab);
  if (tab?.url) {
    set_status('可发送到本地 ingress');
  } else {
    set_status('当前标签页没有可用 URL', 'error');
  }
}

function build_ingress_payload(delivery_mode) {
  if (!state.tab?.url) {
    throw new Error('当前标签页没有可用 URL');
  }

  return {
    url: state.tab.url,
    source: 'chrome-extension',
    route: 'local',
    delivery_mode,
    metadata: build_metadata(state.tab)
  };
}

async function handle_save_local() {
  try {
    set_status('正在发送到本地执行器…');
    const result = await post_json('/api/ingress/save-link', build_ingress_payload('immediate'));
    set_status(`已提交，执行方式：${result.execution}`, 'success');
  } catch (error) {
    set_status(error.message || '发送失败', 'error');
  }
}

async function handle_enqueue_local() {
  try {
    set_status('正在加入本地收件箱…');
    const result = await post_json('/api/ingress/enqueue-link', build_ingress_payload('queue'));
    const added = Number(result?.queue?.added || 0);
    const skipped = Number(result?.queue?.skipped || 0);
    set_status(`已入队，added=${added} skipped=${skipped}`, 'success');
  } catch (error) {
    set_status(error.message || '入队失败', 'error');
  }
}

function handle_open_workbench() {
  chrome.tabs.create({ url: WORKBENCH_URL });
}

document.addEventListener('DOMContentLoaded', async () => {
  $('save-local').addEventListener('click', handle_save_local);
  $('enqueue-local').addEventListener('click', handle_enqueue_local);
  $('open-workbench').addEventListener('click', handle_open_workbench);
  set_actions_enabled(false);

  try {
    await refresh_tab();
  } catch (error) {
    set_status(error.message || '无法读取当前标签页', 'error');
  }
});
