module.exports = {
  name: '005-audit-logs',
  async up({ sequelize }) {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY,
        actor_type VARCHAR(50) NOT NULL,
        actor_id UUID NULL,
        actor_label VARCHAR(255) NULL,
        event_type VARCHAR(100) NOT NULL,
        resource_type VARCHAR(100) NOT NULL,
        resource_id UUID NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'success',
        message TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type
      ON audit_logs (event_type, created_at DESC);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
      ON audit_logs (resource_type, resource_id, created_at DESC);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
      ON audit_logs (actor_type, actor_id, created_at DESC);
    `);
  },
};
