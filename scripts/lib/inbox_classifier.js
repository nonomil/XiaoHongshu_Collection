const DEFAULT_CATEGORIES = {
  AI: ['AI', '人工智能', 'LLM', 'GPT', 'Claude', 'Prompt', 'AIGC', '生成式', 'RAG', 'Agent', 'Embedding', '向量', '微调'],
  理财: ['投资', '基金', 'ETF', '红利', '指数', '定投', '收益率', '资产配置', '理财', '债券', '股票', '回撤'],
  职场: ['简历', '面试', '求职', '晋升', '管理', '绩效', 'KPI', '沟通', '领导力', '职场'],
  学习: ['学习', '笔记', '复盘', '考试', '课程', '读书', '认知', '记忆', '知识体系'],
  工具: ['工具', '软件', '插件', '快捷键', '效率', 'Obsidian', 'Notion', 'Excel', '自动化'],
  数码: ['手机', '电脑', '相机', '耳机', '配置', '测评', '芯片', '续航', '屏幕'],
  生活: ['生活', '整理', '断舍离', '习惯', '健康', '作息'],
  健身: ['训练', '肌肉', '减脂', '增肌', '跑步', '力量', '健身房'],
  美食: ['食谱', '烹饪', '探店', '饮食', '甜品', '咖啡'],
  旅行: ['旅行', '攻略', '酒店', '签证', '行程', '机票'],
  家居: ['家装', '收纳', '软装', '家电'],
  母婴: ['育儿', '宝宝', '母婴', '早教'],
  美妆穿搭: ['护肤', '彩妆', '穿搭', '种草', 'OOTD'],
  情感: ['亲密关系', '心理', '情绪', '沟通', '两性'],
  未分类: []
};

function defaultInboxCategories() {
  return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
}

function normalizeText(...parts) {
  return parts
    .filter(Boolean)
    .map((value) => String(value))
    .join(' ')
    .toLowerCase();
}

function classifyInboxNote({ title = '', content = '', tags = [] } = {}, categories = DEFAULT_CATEGORIES) {
  const text = normalizeText(title, content, Array.isArray(tags) ? tags.join(' ') : '');
  let bestName = '未分类';
  let bestScore = 0;

  for (const [name, keywords] of Object.entries(categories || {})) {
    if (!Array.isArray(keywords) || keywords.length === 0) continue;
    let score = 0;
    for (const keyword of keywords) {
      if (!keyword) continue;
      if (text.includes(String(keyword).toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestName = name;
    }
  }

  return bestScore > 0 ? bestName : '未分类';
}

module.exports = {
  classifyInboxNote,
  defaultInboxCategories
};
