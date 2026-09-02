const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractEventPayload, normalizeMessageId } = require('../../src/services/mail-feedback-service');

test('extractEventPayload maps a bounced event', () => {
  const event = {
    type: 'email.bounced',
    created_at: '2026-09-02T08:00:00.000Z',
    data: {
      message_id: 'abc@email.pixris.online',
      to: ['user@recipient.net'],
      subject: 'Invoice',
      bounce: { reason: '550 User unknown', description: 'mailbox does not exist', status: '5.1.1' },
    },
  };
  const parsed = extractEventPayload(event);
  assert.equal(parsed.type, 'email.bounced');
  assert.equal(parsed.messageId, 'abc@email.pixris.online');
  assert.deepEqual(parsed.recipients, ['user@recipient.net']);
  assert.match(parsed.reason, /550 User unknown/);
  assert.equal(parsed.statusCode, '5.1.1');
});

test('extractEventPayload handles string to and email_id fallback', () => {
  const event = {
    type: 'email.delivered',
    data: { email_id: 'def@x.com', to: 'a@b.com, c@d.com' },
  };
  const parsed = extractEventPayload(event);
  assert.equal(parsed.messageId, 'def@x.com');
  assert.deepEqual(parsed.recipients, ['a@b.com', 'c@d.com']);
});

test('normalizeMessageId strips brackets and lowercases', () => {
  assert.equal(normalizeMessageId('<ABC@X.com>'), 'abc@x.com');
  assert.equal(normalizeMessageId('  abc@x.com  '), 'abc@x.com');
});
