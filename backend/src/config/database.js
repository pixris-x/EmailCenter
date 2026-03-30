const { Sequelize } = require('sequelize');
const { env } = require('./env');

function isDatabaseConfigured() {
  return Boolean(env.database.host && env.database.name && env.database.user);
}

const sequelize = new Sequelize(env.database.name || 'postgres', env.database.user || 'postgres', env.database.password || '', {
  host: env.database.host || '127.0.0.1',
  port: env.database.port,
  dialect: 'postgres',
  schema: env.database.schema,
  logging: false,
  dialectOptions: env.database.sslEnabled
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : {},
});

module.exports = { sequelize, isDatabaseConfigured };