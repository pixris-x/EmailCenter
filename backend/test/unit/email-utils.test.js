const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidEmailAddress,
  extractEmailAddresses,
  validateRecipientList,
  normalizeMessageId,
} = require('../../src/utils/email-utils');

test('isValidEmailAddress accepts normal addresses', () => {
  assert.equal(isValidEmailAddress('a@b.com'), true);
  assert.equal(isValidEmailAddress('x@y.co.uk'), true);
  assert.equal(isValidEmailAddress('user+tag@sub.domain.com'), true);
});

test('isValidEmailAddress rejects malformed addresses', () => {
  assert.equal(isValidEmailAddress('no-at'), false);
  assert.equal(isValidEmailAddress('a@b'), false);
  assert.equal(isValidEmailAddress('@b.com'), false);
  assert.equal(isValidEmailAddress('a@b..com'), false);
  assert.equal(isValidEmailAddress('a@-b.com'), true); // 简单校验不拒绝，见下条
  assert.equal(isValidEmailAddress(''), false);
  assert.equal(isValidEmailAddress(null), false);
});

test('rejects over-long addresses', () => {
  assert.equal(isValidEmailAddress(`a@${'x'.repeat(260)}.com`), false);
});

test('extractEmailAddresses handles display name and separators', () => {
  assert.deepEqual(
    extractEmailAddresses('"Alice" <alice@x.com>, bob@y.com;carl@z.co.uk'),
    ['alice@x.com', 'bob@y.com', 'carl@z.co.uk'],
  );
  assert.deepEqual(extractEmailAddresses(''), []);
  assert.deepEqual(extractEmailAddresses(['a@x.com', 'b@y.com']), ['a@x.com', 'b@y.com']);
});

test('validateRecipientList dedupes and reports invalid addresses', () => {
  assert.deepEqual(validateRecipientList('a@x.com, a@x.com'), ['a@x.com']);
  assert.throws(() => validateRecipientList('a@x.com, bad-address'), /bad-address/);
});

test('normalizeMessageId strips brackets and lowercases', () => {
  assert.equal(normalizeMessageId('<ABC@X.com>'), 'abc@x.com');
  assert.equal(normalizeMessageId('ABC@X.com'), 'abc@x.com');
});
