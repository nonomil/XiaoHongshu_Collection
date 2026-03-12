function isPrintable(str) {
  return !/[\uFFFD\u0000-\u001F]/.test(str);
}

function hasCjkOrAsciiWord(str) {
  return /[\u4e00-\u9fff]/.test(str) || /[A-Za-z0-9]/.test(str);
}

function cleanTags(tags) {
  const out = [];
  for (const raw of tags || []) {
    const t = String(raw || '').trim();
    if (!t) continue;
    if (t.length <= 1) continue;
    if (!isPrintable(t)) continue;
    if (!hasCjkOrAsciiWord(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

module.exports = { cleanTags };
