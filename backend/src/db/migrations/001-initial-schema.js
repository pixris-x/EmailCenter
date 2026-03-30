const initialSchemaSql = `
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY,
  role_code VARCHAR(50) NOT NULL UNIQUE,
  role_name VARCHAR(100) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  role_code VARCHAR(50) NOT NULL REFERENCES role_permissions(role_code),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sender_identities (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  reply_to_email VARCHAR(255),
  provider VARCHAR(50) NOT NULL DEFAULT 'resend_smtp',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_categories (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES template_categories(id) ON DELETE SET NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(120) NOT NULL UNIQUE,
  subject VARCHAR(255) NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  variables_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  approved_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_review_logs (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  reviewer_admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  action VARCHAR(30) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS send_requests (
  id UUID PRIMARY KEY,
  request_no VARCHAR(50) NOT NULL UNIQUE,
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE RESTRICT,
  sender_identity_id UUID NOT NULL REFERENCES sender_identities(id) ON DELETE RESTRICT,
  requested_by_admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
  source_project VARCHAR(120),
  to_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  bcc_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject_override VARCHAR(255),
  template_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_status VARCHAR(30) NOT NULL DEFAULT 'pending_approval',
  delivery_status VARCHAR(30) NOT NULL DEFAULT 'draft',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS send_approval_logs (
  id UUID PRIMARY KEY,
  send_request_id UUID NOT NULL REFERENCES send_requests(id) ON DELETE CASCADE,
  reviewer_admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  action VARCHAR(30) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_jobs (
  id UUID PRIMARY KEY,
  send_request_id UUID NOT NULL REFERENCES send_requests(id) ON DELETE CASCADE,
  queue_name VARCHAR(80) NOT NULL DEFAULT 'email-send',
  provider VARCHAR(50) NOT NULL DEFAULT 'resend_smtp',
  provider_message_id VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY,
  email_job_id UUID REFERENCES email_jobs(id) ON DELETE SET NULL,
  send_request_id UUID NOT NULL REFERENCES send_requests(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  provider_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY,
  send_request_id UUID NOT NULL REFERENCES send_requests(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  checksum_sha256 VARCHAR(128),
  uploaded_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(20) NOT NULL UNIQUE,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_projects JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_role_code ON admin_users(role_code);
CREATE INDEX IF NOT EXISTS idx_sender_identities_status ON sender_identities(status);
CREATE INDEX IF NOT EXISTS idx_template_categories_status ON template_categories(status);
CREATE INDEX IF NOT EXISTS idx_email_templates_category_id ON email_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_status ON email_templates(status);
CREATE INDEX IF NOT EXISTS idx_template_review_logs_template_id ON template_review_logs(template_id);
CREATE INDEX IF NOT EXISTS idx_send_requests_template_id ON send_requests(template_id);
CREATE INDEX IF NOT EXISTS idx_send_requests_sender_identity_id ON send_requests(sender_identity_id);
CREATE INDEX IF NOT EXISTS idx_send_requests_requested_by_admin_id ON send_requests(requested_by_admin_id);
CREATE INDEX IF NOT EXISTS idx_send_requests_approval_status ON send_requests(approval_status);
CREATE INDEX IF NOT EXISTS idx_send_requests_delivery_status ON send_requests(delivery_status);
CREATE INDEX IF NOT EXISTS idx_send_approval_logs_send_request_id ON send_approval_logs(send_request_id);
CREATE INDEX IF NOT EXISTS idx_email_jobs_send_request_id ON email_jobs(send_request_id);
CREATE INDEX IF NOT EXISTS idx_email_jobs_status ON email_jobs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_send_request_id ON email_logs(send_request_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_email_job_id ON email_logs(email_job_id);
CREATE INDEX IF NOT EXISTS idx_attachments_send_request_id ON attachments(send_request_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
`;

module.exports = {
  name: '001-initial-schema',
  async up({ sequelize }) {
    await sequelize.query(initialSchemaSql);
  },
};
