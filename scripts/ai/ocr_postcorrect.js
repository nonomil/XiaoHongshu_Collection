function applyOcrRules(text) {
  let t = text || '';
  const rules = [
    [/收藏天/g, '收藏夹'],
    [/收蔵/g, '收藏'],
    [/小红书收矛夹/g, '小红书收藏夹'],
    [/小红书收藏天/g, '小红书收藏夹'],
    [/Al/g, 'AI'],
    [/A1/g, 'AI'],
    [/寡问一问/g, '问一问'],
    [/寡/g, '的']
  ];
  for (const [re, rep] of rules) {
    t = t.replace(re, rep);
  }
  return t;
}

function computeOcrAnomalyScore(text) {
  const t = text || '';
  if (!t) return 0;
  const len = t.length || 1;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length / len;
  const symbols = (t.match(/[~`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/g) || []).length / len;
  const garbled = (t.match(/[�□■]/g) || []).length / len;
  const score = Math.min(1, 0.6 * (1 - cjk) + 0.3 * symbols + 0.1 * garbled);
  return score;
}

function shouldAiCorrect(score, threshold) {
  return score >= threshold;
}

module.exports = { applyOcrRules, computeOcrAnomalyScore, shouldAiCorrect };
