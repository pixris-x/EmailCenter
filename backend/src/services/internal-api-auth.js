const { createGuardRedisConnection } = require('../config/redis');
const { env } = require('../config/env');
const { sequelize } = require('../config/database');
const { initModels } = require('../models');
const { hashApiKey, hasRequiredScopes } = require('./api-key-service');

const redisClient = createGuardRedisConnection();
redisClient.on('error', (error) => {
  console.warn(`[internal-api-auth] redis error: ${error.message}`);
});

function getModels() {
  return initModels(sequelize);
}

function getApiKeyValue(request) {
  return request.headers['x-api-key'] || request.headers['X-API-Key'];
}

async function applyRateLimit(reply, apiKeyId) {
  const currentMinute = new Date().toISOString().slice(0, 16);
  const redisKey = `internal-api:rate:${apiKeyId}:${currentMinute}`;
  const hits = await redisClient.incr(redisKey);

  if (hits === 1) {
    await redisClient.expire(redisKey, 60);
  }

  reply.header('X-RateLimit-Limit', env.internalApi.rateLimitPerMinute);
  reply.header('X-RateLimit-Remaining', Math.max(env.internalApi.rateLimitPerMinute - hits, 0));

  if (hits > env.internalApi.rateLimitPerMinute) {
    const error = new Error('Internal API rate limit exceeded.');
    error.statusCode = 429;
    throw error;
  }
}

function buildInternalApiGuard(requiredScopes = []) {
  return async function internalApiGuard(request, reply) {
    const apiKeyValue = getApiKeyValue(request);

    if (!apiKeyValue) {
      return reply.status(401).send({ message: 'x-api-key header is required.' });
    }

    const { ApiKey } = getModels();
    const apiKey = await ApiKey.findOne({
      where: { keyHash: hashApiKey(apiKeyValue) },
    });

    if (!apiKey || apiKey.status !== 'active') {
      return reply.status(401).send({ message: 'Invalid API key.' });
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= Date.now()) {
      return reply.status(401).send({ message: 'API key has expired.' });
    }

    if (!hasRequiredScopes(apiKey, requiredScopes)) {
      return reply.status(403).send({ message: 'API key is missing required scope.' });
    }

    try {
      await applyRateLimit(reply, apiKey.id);
    } catch (error) {
      return reply.status(error.statusCode || 429).send({ message: error.message });
    }

    await apiKey.update({ lastUsedAt: new Date() });
    request.internalApi = {
      apiKey,
    };
  };
}

module.exports = {
  buildInternalApiGuard,
};
