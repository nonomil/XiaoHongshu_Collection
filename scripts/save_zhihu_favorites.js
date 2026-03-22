const path = require('path');
const { resolveProjectPaths } = require('./lib/config');
const {
  buildZhihuFavoritesPaths,
  collectZhihuFavoriteEntries,
  fetchZhihuCollectionPage,
  parseZhihuCollectionId
} = require('./lib/zhihu_favorites');
const { saveLinksText } = require('./save_note');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..'));

function parseArgs(argv = []) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error('Usage: node scripts/save_zhihu_favorites.js <collection-url> [--cookie <cookie>] [--title <title>] [--output-root <dir>] [--limit <n>]');
  }

  const args = [...argv];
  const parsed = {
    collectionUrl: ''
  };

  while (args.length > 0) {
    const token = args.shift();
    if (!token) continue;

    switch (token) {
      case '--cookie':
        parsed.cookie = args.shift() || '';
        break;
      case '--title':
        parsed.title = args.shift() || '';
        break;
      case '--output-root':
        parsed.outputRoot = args.shift() || '';
        break;
      case '--limit':
        parsed.limit = Number(args.shift() || 0) || 0;
        break;
      default:
        if (!parsed.collectionUrl) {
          parsed.collectionUrl = token;
          break;
        }
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!parsed.collectionUrl) {
    throw new Error('Usage: node scripts/save_zhihu_favorites.js <collection-url> [--cookie <cookie>] [--title <title>] [--output-root <dir>] [--limit <n>]');
  }

  if (parsed.limit) {
    parsed.limit = Math.max(1, parsed.limit);
  }

  return parsed;
}

function resolveCollectionTitle(title, collectionId) {
  return String(title || '').trim() || `收藏夹 ${collectionId}`;
}

async function run(argv = process.argv.slice(2), options = {}) {
  const parsed = options.parsed || parseArgs(argv);
  const collectionId = parseZhihuCollectionId(parsed.collectionUrl);
  const cookie = String(parsed.cookie || process.env.ZHIHU_COOKIE || '').trim();

  if (!cookie) {
    throw new Error('Zhihu favorites export requires --cookie or ZHIHU_COOKIE');
  }

  const collectionTitle = resolveCollectionTitle(parsed.title, collectionId);
  const outputRoot = String(parsed.outputRoot || options.outputRoot || PATHS.outputDir).trim();
  const paths = buildZhihuFavoritesPaths({
    outputRoot,
    collectionId,
    collectionTitle
  });

  const fetchZhihuCollectionPageFn = options.fetchZhihuCollectionPageFn || fetchZhihuCollectionPage;
  const collectZhihuFavoriteEntriesFn = options.collectZhihuFavoriteEntriesFn || collectZhihuFavoriteEntries;
  const saveLinksTextFn = options.saveLinksTextFn || saveLinksText;
  const limit = Math.max(1, Number(parsed.limit || 20) || 20);

  const collect = await collectZhihuFavoriteEntriesFn({
    collectionId,
    progressPath: paths.progressPath,
    limit,
    fetchPageFn: ({ offset, limit: pageLimit }) => fetchZhihuCollectionPageFn({
      collectionId,
      offset,
      limit: pageLimit,
      cookie
    })
  });

  const urls = collect.entries.map((item) => String(item.url || '').trim()).filter(Boolean);
  const summary = urls.length > 0
    ? await saveLinksTextFn(urls.join('\n'), {
      outputRoot: paths.rootDir
    })
    : {
      total: 0,
      successCount: 0,
      failureCount: 0,
      results: []
    };

  return {
    collectionId,
    collectionTitle,
    paths,
    collect,
    summary
  };
}

if (require.main === module) {
  run()
    .then(({ collectionTitle, summary }) => {
      console.log(`Zhihu favorites export completed: ${collectionTitle}`);
      console.log(`Processed ${summary.total} item(s): ${summary.successCount} succeeded, ${summary.failureCount} failed.`);
      if (summary.failureCount > 0) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(`Zhihu favorites export failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  parseArgs,
  resolveCollectionTitle,
  run
};
