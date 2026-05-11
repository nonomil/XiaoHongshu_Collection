const form = document.getElementById("job-form");
const submitButton = document.getElementById("submit-button");
const emptyState = document.getElementById("empty-state");
const jobState = document.getElementById("job-state");
const jobBadge = document.getElementById("job-badge");
const jobIdText = document.getElementById("job-id");
const batchDirectoryText = document.getElementById("batch-directory");
const jobStatusText = document.getElementById("job-status-text");
const jobLogs = document.getElementById("job-logs");
const jobItems = document.getElementById("job-items");
const dialog = document.getElementById("markdown-dialog");
const dialogTitle = document.getElementById("dialog-title");
const dialogContent = document.getElementById("markdown-content");
const closeDialogButton = document.getElementById("close-dialog");
const platformWarning = document.getElementById("platform-warning");

let activeJobId = null;
let pollTimer = null;

function buildStatusClass(status) {
  return `status-chip status-${status || "queued"}`;
}

function statusLabel(status) {
  const mapping = {
    queued: "排队中",
    running: "处理中",
    succeeded: "已完成",
    partial: "部分完成",
    failed: "失败",
  };
  return mapping[status] || status || "未知状态";
}

function setBusyState(isBusy) {
  submitButton.disabled = isBusy;
  submitButton.textContent = isBusy ? "处理中..." : "开始生成";
}

function updatePlatformWarning() {
  if (!platformWarning) {
    return;
  }
  const urlsText = form.elements["urls_text"]?.value || "";
  const cookiesPath = (form.elements["cookies_path"]?.value || "").trim();
  const hasXiaohongshuUrl = /https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\//i.test(urlsText);
  platformWarning.hidden = !(hasXiaohongshuUrl && !cookiesPath);
}

function renderLogs(logs) {
  jobLogs.innerHTML = "";
  logs.forEach((entry) => {
    const listItem = document.createElement("li");
    listItem.textContent = entry;
    jobLogs.appendChild(listItem);
  });
}

function buildMetaLine(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "meta-line";
  wrapper.innerHTML = `<strong>${label}</strong> ${value || "-"}`;
  return wrapper;
}

async function openMarkdownPreview(jobId, itemIndex, title) {
  const response = await fetch(`/api/jobs/${jobId}/items/${itemIndex}/markdown`);
  if (!response.ok) {
    throw new Error("无法读取 Markdown 预览。");
  }
  dialogTitle.textContent = title || "Markdown 预览";
  dialogContent.textContent = await response.text();
  dialog.showModal();
}

function renderItems(jobId, items) {
  jobItems.innerHTML = "";
  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "item-card";

    const head = document.createElement("div");
    head.className = "item-card-head";
    head.innerHTML = `
      <div>
        <h4>${item.title || `视频 ${index + 1}`}</h4>
        <div class="item-url">${item.url || ""}</div>
      </div>
      <span class="${buildStatusClass(item.status)}">${statusLabel(item.status)}</span>
    `;
    card.appendChild(head);

    card.appendChild(buildMetaLine("摘要来源：", item.summary_source || "extractive"));
    if (item.summary_path) {
      card.appendChild(buildMetaLine("Markdown：", item.summary_path));
    }
    if (item.assets_directory) {
      card.appendChild(buildMetaLine("图片目录：", item.assets_directory));
    }
    if (item.record_directory) {
      card.appendChild(buildMetaLine("记录目录：", item.record_directory));
    }
    if (item.error) {
      card.appendChild(buildMetaLine("错误信息：", item.error));
    }

    const actions = document.createElement("div");
    actions.className = "item-actions";
    if (item.summary_path && item.status === "succeeded") {
      const previewButton = document.createElement("button");
      previewButton.type = "button";
      previewButton.className = "ghost-button";
      previewButton.textContent = "预览 Markdown";
      previewButton.addEventListener("click", async () => {
        try {
          await openMarkdownPreview(jobId, index, item.title || "Markdown 预览");
        } catch (error) {
          window.alert(error.message);
        }
      });
      actions.appendChild(previewButton);
    }
    card.appendChild(actions);
    jobItems.appendChild(card);
  });
}

function renderJob(payload) {
  emptyState.hidden = true;
  jobState.hidden = false;
  jobBadge.className = `head-badge ${payload.status === "running" ? "" : "muted"}`;
  jobBadge.textContent = statusLabel(payload.status);
  jobIdText.textContent = payload.job_id;
  batchDirectoryText.textContent = payload.batch_directory || "尚未生成";
  jobStatusText.textContent = statusLabel(payload.status);
  renderLogs(payload.logs || []);
  renderItems(payload.job_id, payload.items || []);
}

async function pollJob(jobId) {
  const response = await fetch(`/api/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error("无法获取任务状态。");
  }
  const payload = await response.json();
  renderJob(payload);
  const finishedStates = new Set(["succeeded", "partial", "failed"]);
  if (finishedStates.has(payload.status)) {
    clearTimeout(pollTimer);
    pollTimer = null;
    setBusyState(false);
    return;
  }
  pollTimer = window.setTimeout(() => pollJob(jobId), 1200);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusyState(true);

  try {
    const response = await fetch("/api/jobs", {
      method: "POST",
      body: new FormData(form),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "任务创建失败。");
    }
    activeJobId = payload.job_id;
    if (pollTimer) {
      clearTimeout(pollTimer);
    }
    await pollJob(activeJobId);
  } catch (error) {
    setBusyState(false);
    window.alert(error.message);
  }
});

closeDialogButton.addEventListener("click", () => {
  dialog.close();
});

form.elements["urls_text"]?.addEventListener("input", updatePlatformWarning);
form.elements["cookies_path"]?.addEventListener("input", updatePlatformWarning);
updatePlatformWarning();
