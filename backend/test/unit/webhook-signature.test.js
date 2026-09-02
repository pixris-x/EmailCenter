const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyWebhookSignature } = require('../../src/services/webhook-signature');

const SECRET = 'whsec_abc123def456ghi789';
const ID = 'msg_12345';
const TIMESTAMP = String(Math.floor(Date.now() / 1000));
const RAW = '{"type":"email.delivered","data":{"message_id":"<abc@x.com>"}}';

// 生成 Svix 兼容签名：HMAC-SHA256(secret 解码) over `${id}.${ts}.${body}`
function sign(secret, id, ts, body) {
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  return crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
}

function makeHeaders(id, ts, sig) {
  return { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig, 'content-type': 'application/json' };
}

test('valid svix signature passes', () => {
  const signature = sign(SECRET, ID, TIMESTAMP, RAW);
  const result = verifyWebhookSignature({
    rawBody: RAW,
    headers: makeHeaders(ID, TIMESTAMP, `v1,${signature}`),
    secret: SECRET,
    timestampTolerance: 300,
  });
  assert.equal(result.valid, true);
});

test('tampered body is rejected', () => {
  const signature = sign(SECRET, ID, TIMESTAMP, RAW);
  const result = verifyWebhookSignature({
    rawBody: '{"type":"email.delivered","data":{"message_id":"<tampered@x.com>"}}',
    headers: makeHeaders(ID, TIMESTAMP, `v1,${signature}`),
    secret: SECRET,
    timestampTolerance: 300,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'signature-mismatch');
});

test('missing svix headers rejected', () => {
  const result = verifyWebhookSignature({
    rawBody: RAW,
    headers: { 'content-type': 'application/json' },
    secret: SECRET,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'missing-svix-headers');
});

test('stale timestamp rejected', () => {
  const signature = sign(SECRET, ID, String(Math.floor(Date.now() / 1000) - 3600), RAW);
  const result = verifyWebhookSignature({
    rawBody: RAW,
    headers: makeHeaders(ID, String(Math.floor(Date.now() / 1000) - 3600), `v1,${signature}`),
    secret: SECRET,
    timestampTolerance: 300,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid-or-stale-timestamp');
});

test('no secret configured -> valid in dev', () => {
  const result = verifyWebhookSignature({
    rawBody: RAW,
    headers: { 'content-type': 'application/json' },
    secret: '',
  });
  assert.equal(result.valid, true);
  assert.equal(result.reason, 'no-secret-configured');
});
