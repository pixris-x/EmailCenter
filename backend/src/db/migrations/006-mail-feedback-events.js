module.exports = {
  name: '006-mail-feedback-events',
  async up({ sequelize }) {
    await sequelize.query(`
      ALTER TABLE email_jobs
      ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS bounce_type VARCHAR(30) NULL,
      ADD COLUMN IF NOT EXISTS bounce_reason TEXT NULL,
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ NULL;
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS mail_feedback_events (
        id UUID PRIMARY KEY,
        email_job_id UUID NULL REFERENCES email_jobs(id) ON DELETE SET NULL,
        provider_message_id VARCHAR(255) NULL,
        kind VARCHAR(30) NOT NULL,
        status_code VARCHAR(20) NULL,
        reason TEXT NULL,
        raw_content TEXT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_mail_feedback_events_job
      ON mail_feedback_events (email_job_id, received_at DESC);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_mail_feedback_events_provider_message_id
      ON mail_feedback_events (provider_message_id);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_mail_feedback_events_received_at
      ON mail_feedback_events (received_at DESC);
    `);
  },
};
