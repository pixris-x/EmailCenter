const { Queue } = require('bullmq');
const { env } = require('../config/env');
const { getRedisConnectionOptions } = require('../config/redis');

const emailQueue = new Queue(env.queue.emailName, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: env.queue.emailMaxRetries,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

async function enqueueEmailJob(payload, options = {}) {
  return emailQueue.add('send-email', payload, options);
}

async function closeEmailQueue() {
  await emailQueue.close();
}

module.exports = {
  emailQueue,
  enqueueEmailJob,
  closeEmailQueue,
};