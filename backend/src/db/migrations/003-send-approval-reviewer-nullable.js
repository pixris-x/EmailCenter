module.exports = {
  name: '003-send-approval-reviewer-nullable',
  async up({ sequelize }) {
    await sequelize.query(`
      ALTER TABLE send_requests
      ALTER COLUMN requested_by_admin_id DROP NOT NULL;
    `);

    await sequelize.query(`
      ALTER TABLE send_approval_logs
      ALTER COLUMN reviewer_admin_id DROP NOT NULL;
    `);
  },
};