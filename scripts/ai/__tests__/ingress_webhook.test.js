const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFeishuWebhookIngressPayload,
  handleFeishuWebhook
} = require('../../lib/ingress_webhook');

test('handleFeishuWebhook returns challenge during url verification', async () => {
  const result = await handleFeishuWebhook({
    payload: {
      type: 'url_verification',
      challenge: 'challenge-token'
    }
  });

  assert.equal(result.mode, 'verification');
  assert.equal(result.challenge, 'challenge-token');
});

test('buildFeishuWebhookIngressPayload extracts first url from message text', () => {
  const payload = buildFeishuWebhookIngressPayload({
    header: {
      event_id: 'evt_1',
      event_type: 'im.message.receive_v1',
      tenant_key: 'tenant_1'
    },
    event: {
      sender: {
        sender_id: {
          open_id: 'ou_xxx'
        }
      },
      message: {
        message_id: 'om_xxx',
        chat_id: 'oc_xxx',
        chat_type: 'group',
        message_type: 'text',
        create_time: '1775642400000',
        content: JSON.stringify({
          text: '请处理这个链接 https://mp.weixin.qq.com/s/demo 谢谢'
        })
      }
    }
  });

  assert.equal(payload.url, 'https://mp.weixin.qq.com/s/demo');
  assert.equal(payload.source, 'feishu');
  assert.equal(payload.route, 'cloud');
  assert.equal(payload.delivery_mode, 'queue');
  assert.equal(payload.requested_at, '2026-04-08T10:00:00.000Z');
  assert.equal(payload.metadata.feishu.header.event_id, 'evt_1');
  assert.equal(payload.metadata.feishu.message.message_id, 'om_xxx');
  assert.equal(payload.metadata.feishu.sender.sender_id.open_id, 'ou_xxx');
});

test('handleFeishuWebhook enqueues normalized feishu message into ingress queue', async () => {
  let capturedPayload = null;
  const result = await handleFeishuWebhook({
    payload: {
      header: {
        event_id: 'evt_2',
        event_type: 'im.message.receive_v1'
      },
      event: {
        message: {
          message_id: 'om_2',
          content: JSON.stringify({
            text: 'https://www.xiaohongshu.com/explore/abc123'
          })
        }
      }
    },
    enqueueIngressLink: async ({ payload }) => {
      capturedPayload = payload;
      return {
        accepted: true,
        execution: 'queued',
        task: {
          type: 'note-save',
          source: 'feishu',
          route: 'cloud',
          deliveryMode: 'queue'
        },
        queue: {
          added: 1,
          skipped: 0
        }
      };
    }
  });

  assert.equal(capturedPayload.source, 'feishu');
  assert.equal(capturedPayload.route, 'cloud');
  assert.equal(capturedPayload.delivery_mode, 'queue');
  assert.equal(result.accepted, true);
  assert.equal(result.execution, 'queued');
  assert.equal(result.task.type, 'note-save');
});

test('buildFeishuWebhookIngressPayload rejects messages without url', () => {
  assert.throws(() => buildFeishuWebhookIngressPayload({
    header: {
      event_id: 'evt_3',
      event_type: 'im.message.receive_v1'
    },
    event: {
      message: {
        content: JSON.stringify({
          text: '这里只有文本，没有链接'
        })
      }
    }
  }), /url/i);
});
