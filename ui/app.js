const linksForm = document.getElementById('links-form');
const linksText = document.getElementById('links-text');
const linksSubmit = document.getElementById('links-submit');
const collectionSubmit = document.getElementById('collection-submit');
const statusText = document.getElementById('status-text');
const resultOutput = document.getElementById('result-output');

function setBusy(isBusy, message) {
  linksSubmit.disabled = isBusy;
  collectionSubmit.disabled = isBusy;
  statusText.textContent = message;
}

function renderText(value) {
  resultOutput.textContent = value || '暂无输出';
}

function formatLinkResult(payload) {
  const lines = [
    `总数: ${payload.summary.total}`,
    `成功: ${payload.summary.successCount}`,
    `失败: ${payload.summary.failureCount}`,
    ''
  ];

  for (const [index, item] of payload.results.entries()) {
    if (item.status === 'success') {
      lines.push(`${index + 1}. 成功`);
      lines.push(`路径: ${item.filepath || '未返回路径'}`);
    } else {
      lines.push(`${index + 1}. 失败`);
      lines.push(`错误: ${item.error || '未知错误'}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

function formatCollectionResult(payload) {
  const lines = ['收藏导出已完成', ''];
  for (const step of payload.result.steps || []) {
    lines.push(`${step.script}: exit ${step.code}`);
  }

  const logs = Array.isArray(payload.result.logs) ? payload.result.logs : [];
  if (logs.length > 0) {
    lines.push('');
    lines.push('日志:');
    lines.push(...logs);
  }

  return lines.join('\n').trim();
}

async function requestJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || '请求失败');
  }
  return payload;
}

linksForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setBusy(true, '正在顺序保存链接...');
  renderText('任务已提交，等待返回...');

  try {
    const payload = await requestJson('/api/save-links', {
      text: linksText.value
    });
    statusText.textContent = '链接保存完成';
    renderText(formatLinkResult(payload));
  } catch (error) {
    statusText.textContent = '链接保存失败';
    renderText(error.message);
  } finally {
    setBusy(false, statusText.textContent);
  }
});

collectionSubmit.addEventListener('click', async () => {
  setBusy(true, '正在执行收藏导出...');
  renderText('任务已提交，等待返回...');

  try {
    const payload = await requestJson('/api/save-collection', {});
    statusText.textContent = '收藏导出完成';
    renderText(formatCollectionResult(payload));
  } catch (error) {
    statusText.textContent = '收藏导出失败';
    renderText(error.message);
  } finally {
    setBusy(false, statusText.textContent);
  }
});
