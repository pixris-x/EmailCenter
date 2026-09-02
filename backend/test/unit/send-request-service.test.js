const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  toRecipientArray,
  buildRequestNo,
  computeQueueDelay,
  assertValidScheduledAt,
} = require('../../src/services/send-request-service');
const { closeEmailQueue } = require('../../src/queues/email-queue');

// 该文件 require 链路会实例化 BullMQ Queue（保持 Redis 连接），测试结束需显式关闭，
// 否则子进程事件循环不会结束。
after(async () => {
  await closeEmailQueue();
});

test('toRecipientArray splits string, trims, filters empties', () => {
  assert.deepEqual(toRecipientArray(' a@x.com , b@y.com ,,'), ['a@x.com', 'b@y.com']);
  assert.deepEqual(toRecipientArray(['a@x.com', '', 'b@y.com']), ['a@x.com', 'b@y.com']);
  assert.deepEqual(toRecipientArray(''), []);
  assert.deepEqual(toRecipientArray(undefined), []);
});

test('buildRequestNo well-formed and no obvious collisions', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) {
    const no = buildRequestNo();
    assert.match(no, /^SR\d{13,}$/);
    seen.add(no);
  }
  assert.ok(seen.size > 1, 'should produce multiple distinct request numbers');
});

test('computeQueueDelay returns delay for future, 0 otherwise', () => {
  const future = new Date(Date.now() + 60000).toISOString();
  const delay = computeQueueDelay(future);
  assert.ok(delay >= 55000 && delay <= 65000, `delay=${delay}`);
  assert.equal(computeQueueDelay(new Date(Date.now() - 1000).toISOString()), 0);
  assert.equal(computeQueueDelay(null), 0);
  assert.equal(computeQueueDelay('not-a-date'), 0);
  assert.equal(computeQueueDelay(undefined), 0);
});

test('assertValidScheduledAt accepts future, rejects past/invalid', () => {
  assert.doesNotThrow(() => assertValidScheduledAt(new Date(Date.now() + 60000).toISOString()));
  assert.doesNotThrow(() => assertValidScheduledAt(null));
  assert.doesNotThrow(() => assertValidScheduledAt(undefined));
  assert.doesNotThrow(() => assertValidScheduledAt(''));
  assert.throws(() => assertValidScheduledAt(new Date(Date.now() - 60000).toISOString()), /future/);
  assert.throws(() => assertValidScheduledAt('garbage'), /ISO datetime/);
});
