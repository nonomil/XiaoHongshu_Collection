const { JSDOM } = require('jsdom');
const { normalizeArticlePayload } = require('./generic_types');

function textOf(root, selector) {
  return root.querySelector(selector)?.textContent?.trim() || '';
}

function attrOf(root, selector, attribute) {
  return root.querySelector(selector)?.getAttribute(attribute)?.trim() || '';
}

function collectImages(root, selector) {
  const nodes = Array.from(root.querySelectorAll(selector));
  return nodes
    .map((node) =>
      node.getAttribute('data-src')
      || node.getAttribute('src')
      || ''
    )
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
    const root = document.querySelector('#js_content') || document.body;
    return {
      canonicalUrl: (document.querySelector('meta[property="og:url"]')?.getAttribute('content') || location.href || '').trim(),
      title: (document.querySelector('#activity-name')?.textContent || '').trim(),
      author: (document.querySelector('#js_name')?.textContent || '').trim(),
      authorLink: (document.querySelector('#js_name')?.getAttribute('href') || '').trim(),
      date: (document.querySelector('#publish_time')?.textContent || '').trim(),
      content: (root?.innerText || root?.textContent || '').trim(),
      images: Array.from(root.querySelectorAll('img'))
        .map((img) => img.getAttribute('data-src') || img.getAttribute('src') || '')
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    };
  })()`);
}

function extractWechatArticleFromHtml({ url = '', html = '' } = {}) {
  const dom = new JSDOM(String(html || ''));
  const { document } = dom.window;
  const contentRoot = document.querySelector('#js_content') || document.body;
  const canonicalUrl = attrOf(document, 'meta[property="og:url"]', 'content') || String(url || '').trim();

  return normalizeArticlePayload({
    platform: 'wechat',
    sourceType: 'wechat_article',
    sourceUrl: String(url || '').trim(),
    canonicalUrl,
    title: textOf(document, '#activity-name'),
    author: textOf(document, '#js_name'),
    authorLink: attrOf(document, '#js_name', 'href'),
    date: textOf(document, '#publish_time'),
    content: contentRoot.textContent.trim(),
    images: collectImages(contentRoot, 'img'),
    collection: '微信公众号文章'
  });
}

async function extractWechatArticleFromPage(ws, { sendFn, url = '' } = {}) {
  const payload = await evaluateArticlePayload(sendFn, ws) || {};
  return normalizeArticlePayload({
    platform: 'wechat',
    sourceType: 'wechat_article',
    sourceUrl: String(url || '').trim(),
    canonicalUrl: payload.canonicalUrl || String(url || '').trim(),
    title: payload.title,
    author: payload.author,
    authorLink: payload.authorLink,
    date: payload.date,
    content: payload.content,
    images: payload.images,
    collection: '微信公众号文章'
  });
}

module.exports = {
  extractWechatArticleFromHtml,
  extractWechatArticleFromPage
};
