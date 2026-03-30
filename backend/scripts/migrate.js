const path = require('node:path');
const fs = require('node:fs');
const { sequelize, isDatabaseConfigured } = require('../src/config/database');

async function ensureMigrationsTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getExecutedMigrationNames() {
  const [rows] = await sequelize.query('SELECT name FROM schema_migrations ORDER BY executed_at ASC;');
  return new Set(rows.map((row) => row.name));
}

async function markMigrationExecuted(name) {
  await sequelize.query('INSERT INTO schema_migrations (name) VALUES (:name) ON CONFLICT (name) DO NOTHING;', {
    replacements: { name },
  });
}

async function run() {
  if (!isDatabaseConfigured()) {
    throw new Error('Database configuration is incomplete. Provide DB_HOST, DB_NAME, DB_USER and DB_PASSWORD before running migrations.');
  }

  const migrationsDir = path.resolve(__dirname, '..', 'src', 'db', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.js'))
    .sort();

  await sequelize.authenticate();
  await ensureMigrationsTable();

  const executed = await getExecutedMigrationNames();

  for (const migrationFile of migrationFiles) {
    const migration = require(path.join(migrationsDir, migrationFile));

    if (executed.has(migration.name)) {
      console.log(`Skipping ${migration.name}`);
      continue;
    }

    console.log(`Running ${migration.name}`);
    await migration.up({ sequelize });
    await markMigrationExecuted(migration.name);
    console.log(`Completed ${migration.name}`);
  }

  await sequelize.close();
}

run().catch(async (error) => {
  console.error(error.message);
  try {
    await sequelize.close();
  } catch (closeError) {
    // ignore close failures while exiting
  }
  process.exit(1);
});