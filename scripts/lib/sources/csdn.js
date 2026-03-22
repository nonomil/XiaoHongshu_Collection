const { JSDOM } = require('jsdom');
const { normalizeArticlePayload } = require('./generic_types');

function textOf(root, selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const selector of list) {
    const value = root.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return '';
}

function attrOf(root, selector, attribute) {
  return root.querySelector(selector)?.getAttribute(attribute)?.trim() || '';
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text;
}

function collectImages(root) {
  return Array.from(root.querySelectorAll('img'))
    .map((node) => node.getAttribute('data-src') || node.getAttribute('src') || '')
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

async function evaluateValue(sendFn, ws, expression) {
  const result = await sendFn(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true
  });
  return result?.result?.value;
}

async function evaluateArticlePayload(sendFn, ws) {
  return evaluateValue(sendFn, ws, `(() => {
    const root = document.querySelector('#content_views') || document.body;
    return {
      title: (document.querySelector('#articleContentId, .title-article, h1')?.textContent || '').trim(),
      author: (document.querySelector('.follow-nickName, .blog-top-user-name, .article-bar-top [class*="name"], .article-bar-top a[href*="blog.csdn.net"]')?.textContent || '').trim(),
      authorLink: (document.querySelector('.follow-nickName[href*="blog.csdn.net"], .blog-top-user-name[href*="blog.csdn.net"], .article-bar-top a[href*="blog.csdn.net"]')?.href || '').trim(),
      date: (document.querySelector('.time, .article-info-box .time, .bar-content .time')?.textContent || '').trim(),
      content: (root?.innerText || root?.textContent || '').trim(),
      images: Array.from(root.querySelectorAll('img'))
        .map((img) => img.getAttribute('data-src') || img.getAttribute('src') || '')
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    };
  })()`);
}

function extractCsdnArticleFromHtml({ url = '', html = '' } = {}) {
  const dom = new JSDOM(String(html || ''));
  const { document } = dom.window;
  const contentRoot = document.querySelector('#content_views') || document.body;

  return normalizeArticlePayload({
    platform: 'csdn',
    sourceType: 'csdn_article',
    sourceUrl: String(url || '').trim(),
    canonicalUrl: String(url || '').trim(),
    title: textOf(document, ['#articleContentId', '.title-article', 'h1']),
    author: textOf(document, ['.follow-nickName', '.blog-top-user-name', '.article-bar-top a']),
    authorLink: attrOf(document, '.follow-nickName, .blog-top-user-name, .article-bar-top a', 'href'),
    date: normalizeDate(textOf(document, ['.time', '.article-info-box .time', '.bar-content .time'])),
    content: contentRoot.textContent.trim(),
    images: collectImages(contentRoot),
    collection: 'CSDN文章'
  });
}

async function extractCsdnArticleFromPage(ws, { sendFn, url = '' } = {}) {
  const payload = await evaluateArticlePayload(sendFn, ws) || {};
  return normalizeArticlePayload({
    platform: 'csdn',
    sourceType: 'csdn_article',
    sourceUrl: String(url || '').trim(),
    canonicalUrl: String(url || '').trim(),
    title: payload.title,
    author: payload.author,
    authorLink: payload.authorLink,
    date: normalizeDate(payload.date),
    content: payload.content,
    images: payload.images,
    collection: 'CSDN文章'
  });
}

module.exports = {
  extractCsdnArticleFromHtml,
  extractCsdnArticleFromPage
};
