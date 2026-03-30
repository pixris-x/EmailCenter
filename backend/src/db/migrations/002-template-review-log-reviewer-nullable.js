module.exports = {
  name: '002-template-review-log-reviewer-nullable',
  async up({ sequelize }) {
    await sequelize.query(`
      ALTER TABLE template_review_logs
      ALTER COLUMN reviewer_admin_id DROP NOT NULL;
    `);
  },
};