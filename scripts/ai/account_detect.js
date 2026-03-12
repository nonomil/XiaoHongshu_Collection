function parseUserMeResponse(payload) {
  const data = payload?.data || payload?.user || payload?.data?.user || payload?.data?.me || payload?.data?.info || payload?.data?.user_info;
  if (!data) return { uid: '', nickname: '' };
  return {
    uid: String(data.userId || data.uid || data.id || ''),
    nickname: String(data.nickname || data.name || '')
  };
}

module.exports = { parseUserMeResponse };
