module.exports = {
  name: '004-send-requests-api-idempotency',
  async up({ sequelize }) {
    await sequelize.query(`
      ALTER TABLE send_requests
      ADD COLUMN IF NOT EXISTS requested_via_api_key_id UUID NULL;
    `);

    await sequelize.query(`
      ALTER TABLE send_requests
      ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120) NULL;
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_send_requests_requested_via_api_key'
            AND table_name = 'send_requests'
        ) THEN
          ALTER TABLE send_requests
          ADD CONSTRAINT fk_send_requests_requested_via_api_key
          FOREIGN KEY (requested_via_api_key_id)
          REFERENCES api_keys(id)
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_send_requests_api_idempotency
      ON send_requests (requested_via_api_key_id, source_project, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    `);
  },
};
