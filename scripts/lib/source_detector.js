function safeUrl(input) {
  try {
    return new URL(String(input || '').trim());
  } catch (_) {
    return null;
  }
}

function detectSourceFromUrl(input) {
  const url = safeUrl(input);
  if (!url) return 'generic_web';

  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname;

  if (
    /(^|\.)xiaohongshu\.com$/.test(hostname) &&
    /^\/(discovery\/item|explore)\//.test(pathname)
  ) {
    return 'xiaohongshu';
  }

  if (hostname === 'mp.weixin.qq.com' && pathname.startsWith('/s')) {
    return 'wechat_article';
  }

  if (hostname === 'zhuanlan.zhihu.com' && /^\/p\/\d+/.test(pathname)) {
    return 'zhihu_article';
  }

  if (
    /(^|\.)zhihu\.com$/.test(hostname) &&
    /^\/question\/\d+\/answer\/\d+/.test(pathname)
  ) {
    return 'zhihu_answer';
  }

  if (
    /(^|\.)csdn\.net$/.test(hostname) &&
    /\/article\/details\/\d+/.test(pathname)
  ) {
    return 'csdn_article';
  }

  return 'generic_web';
}

module.exports = {
  detectSourceFromUrl
};
