const { env } = require('./env');

function createLoggerOptions() {
  const isDevelopment = env.app.env !== 'production';

  return {
    level: isDevelopment ? 'debug' : 'info',
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  };
}

module.exports = { createLoggerOptions };
