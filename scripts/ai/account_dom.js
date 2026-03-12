const { buildAccountKey } = require('./account');

function buildAccountKeyFromDom(info) {
  const nickname = info?.nickname || '';
  const uid = info?.uid || '';
  if (nickname && uid) return buildAccountKey({ nickname, uid });
  if (nickname) return `${nickname}_unknown`;
  return 'unknown_000000';
}

module.exports = { buildAccountKeyFromDom };
