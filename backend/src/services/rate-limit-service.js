// Redis 限流与登录防护。
// 提供通用固定窗口限流，以及基于 email + IP 的登录失败锁定。
// Redis 不可用时默认放行（记录告警），避免依赖服务故障导致管理台完全不可登录。

const { createGuardRedisConnection } = require('../config/redis');
const { env } = require('../config/env');

const FAIL_WINDOW_SECONDS = 15 * 60;
const IP_WINDOW_SECONDS = 60;

const redisClient = createGuardRedisConnection();
redisClient.on('error', (error) => {
  console.warn(`[rate-limit] redis error: ${error.message}`);
});

async function safeRedis(operation, fallback) {
  try {
    return await operation();
  } catch (error) {
    console.warn(`[rate-limit] redis operation failed, falling back: ${error.message}`);
    return fallback;
  }
}

function emailFailKey(email) {
  return `admin:login:fail:${String(email).toLowerCase()}`;
}

function emailLockKey(email) {
  return `admin:login:lock:${String(email).toLowerCase()}`;
}

function ipAttemptKey(ip) {
  return `admin:login:ip:${ip}`;
}

function buildRateLimitError(label) {
  const error = new Error(`${label}请求过于频繁，请稍后再试。`);
  error.statusCode = 429;
  return error;
}

// 通用固定窗口限流（默认 1 分钟窗口）。超过 limit 时抛 statusCode=429 的 Error。
async function consumeFixedWindowRateLimit({ key, limit, windowSeconds = 60, label = '' }) {
  const hits = await safeRedis(() => redisClient.incr(key), 0);

  if (hits === 1) {
    await safeRedis(() => redisClient.expire(key, windowSeconds), null);
  }

  if (hits > limit) {
    throw buildRateLimitError(label);
  }

  return hits;
}

// 登录前检查：email 处于锁定态，或当前 IP 已超过每分钟尝试上限 → 返回原因，否则 null。
async function assertLoginAllowed({ email, ip }) {
  const lockExists = await safeRedis(
    () => redisClient.exists(emailLockKey(email || '')),
    0,
  );
  if (lockExists) {
    return { blocked: true, reason: 'email_locked' };
  }

  const ipHits = Number(await safeRedis(() => redisClient.get(ipAttemptKey(ip || '')), 0) || 0);
  if (ipHits > env.app.loginIpMaxPerMinute) {
    return { blocked: true, reason: 'ip_blocked' };
  }

  return null;
}

// 记录一次登录失败：email 失败数超过阈值则锁定；IP 每分钟尝试数超限则标记。
async function recordLoginFailure({ email, ip }) {
  let emailLocked = false;

  if (email) {
    const emailFails = await safeRedis(() => redisClient.incr(emailFailKey(email)), 1);
    if (emailFails === 1) {
      await safeRedis(() => redisClient.expire(emailFailKey(email), FAIL_WINDOW_SECONDS), null);
    }
    if (emailFails >= env.app.loginMaxFailures) {
      await safeRedis(
        () => redisClient.set(emailLockKey(email), '1', 'EX', env.app.loginLockMinutes * 60),
        null,
      );
      emailLocked = true;
    }
  }

  const ipHits = await safeRedis(() => redisClient.incr(ipAttemptKey(ip || '')), 1);
  if (ipHits === 1) {
    await safeRedis(() => redisClient.expire(ipAttemptKey(ip || ''), IP_WINDOW_SECONDS), null);
  }
  const ipBlocked = ipHits > env.app.loginIpMaxPerMinute;

  return { emailLocked, ipBlocked };
}

async function clearLoginFailures(email) {
  if (!email) {
    return;
  }

  await safeRedis(() => redisClient.del(emailFailKey(email)), null);
}

module.exports = {
  consumeFixedWindowRateLimit,
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
};
