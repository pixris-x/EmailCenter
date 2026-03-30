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
  getRedisConnectionOptions,
  pingRedis,
};