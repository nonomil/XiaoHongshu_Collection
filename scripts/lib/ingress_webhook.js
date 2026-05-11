const { enqueueLinkViaIngress } = require('./ingress');

function clone_plain_object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return JSON.parse(JSON.stringify(value));
}

function create_status_error(message, status_code = 400) {
  const error = new Error(message);
  error.statusCode = status_code;
  return error;
}

function parse_structured_text(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_) {
    return { text };
  }

  return {};
}

function trim_trailing_url_punctuation(value) {
  let url = String(value || '').trim();
  while (/[)\],.!?;:'"”，。、；！？]$/.test(url)) {
    url = url.slice(0, -1);
  }
  return url;
}

function extract_first_url(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return '';
  }

  const matches = raw.match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const match of matches) {
    const candidate = trim_trailing_url_punctuation(match);
    try {
      const parsed = new URL(candidate);
      if (/^https?:$/.test(parsed.protocol)) {
        return parsed.toString();
      }
    } catch (_) {
      continue;
    }
  }

  return '';
}

function normalize_requested_at(value, now = new Date()) {
  const text = String(value || '').trim();
  if (!text) {
    return now.toISOString();
  }

  const numeric = Number(text);
  const date = Number.isFinite(numeric) && numeric > 0
    ? new Date(numeric > 1e12 ? numeric : numeric * 1000)
    : new Date(text);

  if (Number.isNaN(date.getTime())) {
    return now.toISOString();
  }

  return date.toISOString();
}

function build_text_candidates(payload, parsed_content) {
  const header = clone_plain_object(payload?.header);
  const event = clone_plain_object(payload?.event);
  const message = clone_plain_object(event?.message);
  const values = [
    payload?.url,
    payload?.text,
    payload?.content,
    event?.text_without_at_bot,
    parsed_content?.text,
    message?.content,
    header?.event_type
  ];
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function assert_webhook_token(payload, verification_token) {
  const expected = String(verification_token || '').trim();
  if (!expected) {
    return;
  }

  const actual = String(payload?.token || payload?.header?.token || '').trim();
  if (!actual || actual !== expected) {
    throw create_status_error('Invalid webhook token', 401);
  }
}

function buildFeishuWebhookIngressPayload(payload = {}, {
  defaultRoute = 'cloud',
  now = new Date()
} = {}) {
  const header = clone_plain_object(payload.header);
  const event = clone_plain_object(payload.event);
  const sender = clone_plain_object(event.sender);
  const message = clone_plain_object(event.message);
  const parsed_content = parse_structured_text(
    message.content || payload.content || payload.text || event.text_without_at_bot
  );
  const url = payload.url
    ? String(payload.url).trim()
    : build_text_candidates(payload, parsed_content)
      .map((candidate) => extract_first_url(candidate))
      .find(Boolean);

  if (!url) {
    throw create_status_error('Webhook message does not contain url');
  }

  return {
    url,
    source: 'feishu',
    route: String(payload.route || defaultRoute || 'cloud').trim() || 'cloud',
    delivery_mode: 'queue',
    requested_at: normalize_requested_at(
      message.create_time || event.create_time || header.create_time || payload.requested_at || payload.requestedAt,
      now
    ),
    metadata: {
      feishu: {
        header,
        sender,
        message: {
          ...message,
          parsed_content
        },
        text_without_at_bot: String(event.text_without_at_bot || '').trim()
      }
    }
  };
}

async function handleFeishuWebhook({
  payload,
  enqueueIngressLink,
  store,
  defaults = {},
  verificationToken = ''
} = {}) {
  const body = payload && typeof payload === 'object' ? payload : {};
  assert_webhook_token(body, verificationToken);

  if (String(body.type || '').trim() === 'url_verification') {
    return {
      mode: 'verification',
      challenge: String(body.challenge || '').trim()
    };
  }

  const ingress_payload = buildFeishuWebhookIngressPayload(body, defaults);
  if (typeof enqueueIngressLink === 'function') {
    const result = await enqueueIngressLink({ payload: ingress_payload });
    return {
      mode: 'event',
      ...result
    };
  }

  if (!store || typeof store.append !== 'function') {
    throw create_status_error('enqueueIngressLink or store is required', 500);
  }

  const result = await enqueueLinkViaIngress({
    payload: ingress_payload,
    store
  });
  return {
    mode: 'event',
    ...result
  };
}

module.exports = {
  buildFeishuWebhookIngressPayload,
  handleFeishuWebhook
};
