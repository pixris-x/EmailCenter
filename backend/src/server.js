const { buildApp } = require('./app');
const { env, validateRequiredConfig } = require('./config/env');
const { sequelize, isDatabaseConfigured } = require('./config/database');
const { initModels } = require('./models');

async function start() {
  const app = buildApp();
  initModels(sequelize);

  const { problems } = validateRequiredConfig();
  if (problems.length) {
    app.log.warn({ problems }, 'Configuration check warnings (non-production)');
  }

  try {
    if (isDatabaseConfigured()) {
      await sequelize.authenticate();
      app.log.info('Database connection initialized');
    } else {
      app.log.warn('Database configuration is incomplete. Skipping database connection test.');
    }

    await app.listen({
      port: env.app.port,
      host: env.app.host,
    });

    app.log.info(`Server running at http://${env.app.host}:${env.app.port}`);
  } catch (error) {
    app.log.error(error, 'Failed to start backend');
    process.exit(1);
  }
}

start();