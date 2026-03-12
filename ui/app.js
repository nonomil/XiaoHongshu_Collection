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

function renderReport(payload) {
  const report = payload?.report || payload;
  renderText(JSON.stringify(report, null, 2));
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
    renderReport(payload);
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
    renderReport(payload);
  } catch (error) {
    statusText.textContent = '收藏导出失败';
    renderText(error.message);
  } finally {
    setBusy(false, statusText.textContent);
  }
});
