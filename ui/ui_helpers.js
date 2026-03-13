function buildSummaryItems(config = {}) {
  const items = [];
  const paths = config.paths || {};
  if (paths.saveLinksOutputRoot) {
    items.push({ label: '输出路径', value: paths.saveLinksOutputRoot });
  }

  const naming = config.naming || {};
  if (naming.conflictStrategy) {
    const label = naming.conflictStrategy === 'content-aware' ? '智能覆盖' : '直接覆盖';
    items.push({ label: '冲突策略', value: label });
  }

  const runtime = config.runtime || {};
  const aiOn = runtime.aiSummaryEnabled !== false;
  const visionOn = runtime.visionOcrEnabled !== false;
  const ocrOn = runtime.ocrFallbackEnabled !== false;
  items.push({
    label: 'AI/OCR',
    value: `${aiOn ? 'AI开' : 'AI关'} / ${visionOn ? 'Vision开' : 'Vision关'} / ${ocrOn ? 'OCR开' : 'OCR关'}`
  });

  if (runtime.maxImagesPerNote) {
    items.push({ label: 'OCR上限', value: String(runtime.maxImagesPerNote) });
  }

  return items;
}

function openSettingsModal({ overlay, modal } = {}) {
  if (overlay) overlay.hidden = false;
  if (modal) modal.hidden = false;
}

function closeSettingsModal({ overlay, modal } = {}) {
  if (overlay) overlay.hidden = true;
  if (modal) modal.hidden = true;
}

if (typeof module !== 'undefined') {
  module.exports = { buildSummaryItems, openSettingsModal, closeSettingsModal };
}

if (typeof window !== 'undefined') {
  window.XhsUiHelpers = { buildSummaryItems, openSettingsModal, closeSettingsModal };
}
