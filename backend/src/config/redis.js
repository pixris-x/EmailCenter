const IORedis = require('ioredis');
const { env } = require('./env');

function getRedisConnectionOptions() {
  return {
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
}

function createRedisConnection() {
  return new IORedis(getRedisConnectionOptions());
}

// 面向请求守卫（登录防爆破、接口限流）的专用连接：
// 快速失败 + 有限重试，避免 Redis 不可用时请求无限挂起；命令失败由调用方降级放行。
// 注意：不要用于 BullMQ（其阻塞命令需要 maxRetriesPerRequest: null）。
function createGuardRedisConnection() {
  return new IORedis({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password || undefined,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    retryStrategy(times) {
      // 3 次重试后放弃：连接进入终态，排队命令快速报错，让守卫逻辑走降级分支。
      if (times > 3) {
        return null;
      }
      return Math.min(times * 200, 1000);
    },
  });
}

async function pingRedis() {
  const client = createRedisConnection();

  try {
    const response = await client.ping();
    return response;
  } finally {
    client.disconnect();
  }
}

module.exports = {
  createRedisConnection,
  createGuardRedisConnection,
  getRedisConnectionOptions,
  pingRedis,
};