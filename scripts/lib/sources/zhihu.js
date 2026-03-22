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

function attrOf(root, selectors, attribute) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const selector of list) {
    const value = root.querySelector(selector)?.getAttribute(attribute)?.trim();
    if (value) return value;
  }
  return '';
}

function absoluteZhihuLink(value) {
  const href = String(value || '').trim();
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  return `https://www.zhihu.com${href.startsWith('/') ? '' : '/'}${href}`;
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text;
}

function collectImages(root) {
  return Array.from(root.querySelectorAll('img'))
    .map((node) => node.getAttribute('data-original') || node.getAttribute('src') || '')
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
    const root = document.querySelector('.Post-RichTextContainer') || document.body;
    return {
      title: (document.querySelector('.Post-Title, h1')?.textContent || '').trim(),
      author: (document.querySelector('.AuthorInfo-name, .UserLink-link')?.textContent || '').trim(),
      authorLink: (document.querySelector('.AuthorInfo-name, .UserLink-link')?.href || '').trim(),
      date: (document.querySelector('.ContentItem-time')?.textContent || '').trim(),
      content: (root?.innerText || root?.textContent || '').trim(),
      images: Array.from(root.querySelectorAll('img'))
        .map((img) => img.getAttribute('data-original') || img.getAttribute('src') || '')
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    };
  })()`);
}

async function evaluateAnswerPayload(sendFn, ws) {
  return evaluateValue(sendFn, ws, `(() => {
    const answerRoot = document.querySelector('.AnswerItem') || document.body;
    const root = answerRoot.querySelector('.RichContent') || answerRoot;
    return {
      title: (document.querySelector('.QuestionHeader-title, h1')?.textContent || '').trim(),
      author: (document.querySelector('.AnswerItem .AuthorInfo-name, .AnswerItem .UserLink-link')?.textContent || '').trim(),
      authorLink: (document.querySelector('.AnswerItem .AuthorInfo-name, .AnswerItem .UserLink-link')?.href || '').trim(),
      date: (answerRoot.querySelector('meta[itemprop="dateCreated"]')?.getAttribute('content') || answerRoot.querySelector('.ContentItem-time')?.textContent || '').trim(),
      content: (root?.innerText || root?.textContent || '').trim(),
      images: Array.from(root.querySelectorAll('img'))
        .map((img) => img.getAttribute('data-original') || img.getAttribute('src') || '')
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    };
  })()`);
}

function extractZhihuArticleFromHtml({ url = '', html = '' } = {}) {
  const dom = new JSDOM(String(html || ''));
  const { document } = dom.window;
  const contentRoot = document.querySelector('.Post-RichTextContainer') || document.body;

  return normalizeArticlePayload({
    platform: 'zhihu',
    sourceType: 'zhihu_article',
    sourceUrl: String(url || '').trim(),
    canonicalUrl: String(url || '').trim(),
    title: textOf(document, ['.Post-Title', 'h1']),
    author: textOf(document, ['.AuthorInfo-name', '.UserLink-link']),
    authorLink: absoluteZhihuLink(attrOf(document, ['.AuthorInfo-name', '.UserLink-link'], 'href')),
    date: normalizeDate(textOf(document, '.ContentItem-time')),
    content: contentRoot.textContent.trim(),
    images: collectImages(contentRoot),
    collection: '知乎文章'
  });
}

function extractZhihuAnswerFromHtml({ url = '', html = '' } = {}) {
  const dom = new JSDOM(String(html || ''));
  const { document } = dom.window;
  const answerRoot = document.querySelector('.AnswerItem') || document.body;
  const contentRoot = answerRoot.querySelector('.RichContent') || answerRoot;

  return normalizeArticlePayload({
    platform: 'zhihu',
    sourceType: 'zhihu_answer',
    sourceUrl: String(url || '').trim(),
    canonicalUrl: String(url || '').trim(),
    title: textOf(document, ['.QuestionHeader-title', 'h1']),
    author: textOf(answerRoot, ['.AuthorInfo-name', '.UserLink-link']),
    authorLink: absoluteZhihuLink(attrOf(answerRoot, ['.AuthorInfo-name', '.UserLink-link'], 'href')),
    date: normalizeDate(attrOf(answerRoot, 'meta[itemprop="dateCreated"]', 'content') || textOf(answerRoot, '.ContentItem-time')),
    content: contentRoot.textContent.trim(),
    images: collectImages(contentRoot),
    collection: '知乎回答'
  });
}

async function extractZhihuArticleFromPage(ws, { sendFn, url = '' } = {}) {
  const payload = await evaluateArticlePayload(sendFn, ws) || {};
  return normalizeArticlePayload({
    platform: 'zhihu',
    sourceType: 'zhihu_article',
    sourceUrl: String(url || '').trim(),
    canonicalUrl: String(url || '').trim(),
    title: payload.title,
    author: payload.author,
    authorLink: payload.authorLink,
    date: normalizeDate(payload.date),
    content: payload.content,
    images: payload.images,
    collection: '知乎文章'
  });
}

async function extractZhihuAnswerFromPage(ws, { sendFn, url = '' } = {}) {
  const payload = await evaluateAnswerPayload(sendFn, ws) || {};
  return normalizeArticlePayload({
    platform: 'zhihu',
    sourceType: 'zhihu_answer',
    sourceUrl: String(url || '').trim(),
    canonicalUrl: String(url || '').trim(),
    title: payload.title,
    author: payload.author,
    authorLink: payload.authorLink,
    date: normalizeDate(payload.date),
    content: payload.content,
    images: payload.images,
    collection: '知乎回答'
  });
}

module.exports = {
  extractZhihuArticleFromHtml,
  extractZhihuAnswerFromHtml,
  extractZhihuArticleFromPage,
  extractZhihuAnswerFromPage
};
