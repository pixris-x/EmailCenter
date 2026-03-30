const { DataTypes } = require('sequelize');

let initializedModels;

function withTimestamps(options = {}) {
  return {
    underscored: true,
    freezeTableName: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    ...options,
  };
}

function initModels(sequelize) {
  if (initializedModels) {
    return initializedModels;
  }

  const RolePermission = sequelize.define('RolePermission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    roleCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'role_code',
    },
    roleName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'role_name',
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'role_permissions',
    ...withTimestamps(),
  });

  const AdminUser = sequelize.define('AdminUser', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash',
    },
    displayName: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'display_name',
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'active',
    },
    roleCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'role_code',
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login_at',
    },
  }, {
    tableName: 'admin_users',
    ...withTimestamps(),
  });

  const SenderIdentity = sequelize.define('SenderIdentity', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    replyToEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'reply_to_email',
    },
    provider: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'resend_smtp',
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'active',
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_default',
    },
  }, {
    tableName: 'sender_identities',
    ...withTimestamps(),
  });

  const TemplateCategory = sequelize.define('TemplateCategory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'active',
    },
  }, {
    tableName: 'template_categories',
    ...withTimestamps(),
  });

  const EmailTemplate = sequelize.define('EmailTemplate', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'category_id',
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    htmlContent: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'html_content',
    },
    textContent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'text_content',
    },
    variablesSchema: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'variables_schema',
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'draft',
    },
    createdByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_admin_id',
    },
    updatedByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'updated_by_admin_id',
    },
    approvedByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'approved_by_admin_id',
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at',
    },
    rejectedReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejected_reason',
    },
  }, {
    tableName: 'email_templates',
    ...withTimestamps(),
  });

  const TemplateReviewLog = sequelize.define('TemplateReviewLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    templateId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'template_id',
    },
    reviewerAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reviewer_admin_id',
    },
    action: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  }, {
    tableName: 'template_review_logs',
    underscored: true,
    freezeTableName: true,
    timestamps: false,
  });

  const SendRequest = sequelize.define('SendRequest', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    requestNo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'request_no',
    },
    templateId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'template_id',
    },
    senderIdentityId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'sender_identity_id',
    },
    requestedByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'requested_by_admin_id',
    },
    requestedViaApiKeyId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'requested_via_api_key_id',
    },
    sourceType: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'manual',
      field: 'source_type',
    },
    sourceProject: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'source_project',
    },
    idempotencyKey: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'idempotency_key',
    },
    toRecipients: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'to_recipients',
    },
    ccRecipients: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'cc_recipients',
    },
    bccRecipients: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'bcc_recipients',
    },
    subjectOverride: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'subject_override',
    },
    templatePayload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'template_payload',
    },
    approvalStatus: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'pending_approval',
      field: 'approval_status',
    },
    deliveryStatus: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'draft',
      field: 'delivery_status',
    },
    requestedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'requested_at',
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at',
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'rejected_at',
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason',
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'scheduled_at',
    },
  }, {
    tableName: 'send_requests',
    ...withTimestamps(),
  });

  const SendApprovalLog = sequelize.define('SendApprovalLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sendRequestId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'send_request_id',
    },
    reviewerAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reviewer_admin_id',
    },
    action: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  }, {
    tableName: 'send_approval_logs',
    underscored: true,
    freezeTableName: true,
    timestamps: false,
  });

  const EmailJob = sequelize.define('EmailJob', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sendRequestId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'send_request_id',
    },
    queueName: {
      type: DataTypes.STRING(80),
      allowNull: false,
      defaultValue: 'email-send',
      field: 'queue_name',
    },
    provider: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'resend_smtp',
    },
    providerMessageId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'provider_message_id',
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'pending',
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    maxAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
      field: 'max_attempts',
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_error',
    },
    queuedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'queued_at',
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at',
    },
    finishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'finished_at',
    },
  }, {
    tableName: 'email_jobs',
    ...withTimestamps(),
  });

  const EmailLog = sequelize.define('EmailLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    emailJobId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'email_job_id',
    },
    sendRequestId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'send_request_id',
    },
    eventType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'event_type',
    },
    level: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'info',
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    providerResponse: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'provider_response',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  }, {
    tableName: 'email_logs',
    underscored: true,
    freezeTableName: true,
    timestamps: false,
  });

  const Attachment = sequelize.define('Attachment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sendRequestId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'send_request_id',
    },
    originalName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'original_name',
    },
    storedName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'stored_name',
    },
    mimeType: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'mime_type',
    },
    fileSizeBytes: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'file_size_bytes',
    },
    storagePath: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'storage_path',
    },
    checksumSha256: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'checksum_sha256',
    },
    uploadedByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'uploaded_by_admin_id',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  }, {
    tableName: 'attachments',
    underscored: true,
    freezeTableName: true,
    timestamps: false,
  });


  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    actorType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'actor_type',
    },
    actorId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'actor_id',
    },
    actorLabel: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'actor_label',
    },
    eventType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'event_type',
    },
    resourceType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'resource_type',
    },
    resourceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'resource_id',
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'success',
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  }, {
    tableName: 'audit_logs',
    underscored: true,
    freezeTableName: true,
    timestamps: false,
  });
  const ApiKey = sequelize.define('ApiKey', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    keyPrefix: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      field: 'key_prefix',
    },
    keyHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'key_hash',
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'active',
    },
    scopes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    allowedProjects: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'allowed_projects',
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_used_at',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
    createdByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_admin_id',
    },
  }, {
    tableName: 'api_keys',
    ...withTimestamps(),
  });

  AdminUser.belongsTo(RolePermission, { foreignKey: 'roleCode', targetKey: 'roleCode', as: 'rolePermission' });
  EmailTemplate.belongsTo(TemplateCategory, { foreignKey: 'categoryId', as: 'category' });
  TemplateReviewLog.belongsTo(EmailTemplate, { foreignKey: 'templateId', as: 'template' });
  EmailTemplate.hasMany(TemplateReviewLog, { foreignKey: 'templateId', as: 'reviewLogs' });
  SendRequest.belongsTo(EmailTemplate, { foreignKey: 'templateId', as: 'template' });
  SendRequest.belongsTo(SenderIdentity, { foreignKey: 'senderIdentityId', as: 'senderIdentity' });
  SendRequest.belongsTo(ApiKey, { foreignKey: 'requestedViaApiKeyId', as: 'requestedViaApiKey' });
  SendRequest.hasMany(SendApprovalLog, { foreignKey: 'sendRequestId', as: 'approvalLogs' });
  SendRequest.hasMany(Attachment, { foreignKey: 'sendRequestId', as: 'attachments' });
  SendRequest.hasMany(EmailJob, { foreignKey: 'sendRequestId', as: 'jobs' });
  SendRequest.hasMany(EmailLog, { foreignKey: 'sendRequestId', as: 'logs' });
  SendApprovalLog.belongsTo(SendRequest, { foreignKey: 'sendRequestId', as: 'sendRequest' });
  EmailJob.belongsTo(SendRequest, { foreignKey: 'sendRequestId', as: 'sendRequest' });
  EmailJob.hasMany(EmailLog, { foreignKey: 'emailJobId', as: 'logs' });
  EmailLog.belongsTo(EmailJob, { foreignKey: 'emailJobId', as: 'emailJob' });
  EmailLog.belongsTo(SendRequest, { foreignKey: 'sendRequestId', as: 'sendRequest' });
  Attachment.belongsTo(SendRequest, { foreignKey: 'sendRequestId', as: 'sendRequest' });
  ApiKey.belongsTo(AdminUser, { foreignKey: 'createdByAdminId', as: 'createdByAdmin' });
  ApiKey.hasMany(SendRequest, { foreignKey: 'requestedViaApiKeyId', as: 'sendRequests' });

  initializedModels = {
    RolePermission,
    AdminUser,
    SenderIdentity,
    TemplateCategory,
    EmailTemplate,
    TemplateReviewLog,
    SendRequest,
    SendApprovalLog,
    EmailJob,
    EmailLog,
    Attachment,
    AuditLog,
    ApiKey,
  };

  return initializedModels;
}

module.exports = { initModels };







