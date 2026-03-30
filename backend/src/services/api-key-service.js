const crypto = require('node:crypto');

function normalizeStringArray(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return fallback;
}

function hashApiKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function generateApiKeySecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function buildPlainTextApiKey(prefix, secret) {
  return `ec_${prefix}_${secret}`;
}

function generateApiKeyMaterial() {
  const prefix = crypto.randomBytes(6).toString('hex');
  const secret = generateApiKeySecret(24);
  const plainTextKey = buildPlainTextApiKey(prefix, secret);

  return {
    prefix,
    secret,
    plainTextKey,
    keyHash: hashApiKey(plainTextKey),
  };
}

function serializeApiKey(item, options = {}) {
  const json = item.toJSON();
  delete json.keyHash;

  if (options.includePlainTextKey) {
    json.plainTextKey = options.includePlainTextKey;
  }

  return json;
}

function validateApiKeyScopes(scopes) {
  const normalized = normalizeStringArray(scopes, ['send:create', 'send:read']);
  return normalized.length ? normalized : ['send:create', 'send:read'];
}

function validateAllowedProjects(projects) {
  return normalizeStringArray(projects, []);
}

function isProjectAllowed(apiKey, sourceProject) {
  const allowedProjects = validateAllowedProjects(apiKey.allowedProjects);

  if (!sourceProject) {
    return false;
  }

  if (!allowedProjects.length) {
    return false;
  }

  return allowedProjects.includes('*') || allowedProjects.includes(sourceProject);
}

async function createApiKeyRecord(ApiKey, payload) {
  const material = generateApiKeyMaterial();
  const item = await ApiKey.create({
    name: payload.name,
    keyPrefix: material.prefix,
    keyHash: material.keyHash,
    status: 'active',
    scopes: validateApiKeyScopes(payload.scopes),
    allowedProjects: validateAllowedProjects(payload.allowedProjects),
    expiresAt: payload.expiresAt || null,
    createdByAdminId: payload.createdByAdminId || null,
  });

  return {
    item,
    plainTextKey: material.plainTextKey,
  };
}

function hasRequiredScopes(apiKey, requiredScopes = []) {
  const grantedScopes = validateApiKeyScopes(apiKey.scopes);
  return requiredScopes.every((scope) => grantedScopes.includes(scope));
}

module.exports = {
  hashApiKey,
  buildPlainTextApiKey,
  generateApiKeyMaterial,
  serializeApiKey,
  validateApiKeyScopes,
  validateAllowedProjects,
  isProjectAllowed,
  createApiKeyRecord,
  hasRequiredScopes,
};
