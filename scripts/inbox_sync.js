const { syncInbox } = require('./lib/inbox_sync');

async function main() {
  const result = await syncInbox();
  const summary = [
    `Inbox sync complete.`,
    `Added: ${result.added}`,
    `Skipped: ${result.skipped}`,
    `Total: ${result.total}`
  ].join(' ');
  console.log(summary);
}

main().catch((error) => {
  console.error(error && error.message ? error.message : 'Inbox sync failed.');
  process.exitCode = 1;
});
