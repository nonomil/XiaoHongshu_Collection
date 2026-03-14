const { saveInboxUrls } = require('./lib/inbox_save');

function printSummary(summary) {
  if (!summary || typeof summary !== 'object') return;

  if (summary.total === 1 && summary.successCount === 1 && summary.results?.[0]?.filepath) {
    console.log(`Saved note to ${summary.results[0].filepath}`);
    return;
  }

  console.log(`Processed ${summary.total} note(s): ${summary.successCount} succeeded, ${summary.failureCount} failed.`);
  for (const item of summary.results || []) {
    if (item.status === 'success') {
      console.log(`[OK] ${item.filepath || item.canonicalUrl || item.navigationUrl}`);
      continue;
    }
    console.error(`[FAIL] ${item.input || item.navigationUrl || item.noteId}: ${item.error}`);
  }
}

async function main() {
  const { total, summary } = await saveInboxUrls();
  if (!total) {
    console.log('Inbox is empty. Nothing to save.');
    return;
  }
  printSummary(summary);
  if (summary?.failureCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : 'Inbox save failed.');
  process.exitCode = 1;
});
