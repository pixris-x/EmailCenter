const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  hashApiKey,
  generateApiKeyMaterial,
  validateApiKeyScopes,
  validateAllowedProjects,
  isProjectAllowed,
  hasRequiredScopes,
} = require('../../src/services/api-key-service');

test('hashApiKey is deterministic sha256 hex', () => {
  const first = hashApiKey('ec_abc_secret');
  const second = hashApiKey('ec_abc_secret');
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(hashApiKey('ec_abc_secret'), hashApiKey('ec_abc_secret2'));
});

test('generateApiKeyMaterial produces prefixed key and matching hash', () => {
  const material = generateApiKeyMaterial();
  assert.match(material.plainTextKey, /^ec_[0-9a-f]{12}_[0-9a-f]{48}$/);
  assert.equal(hashApiKey(material.plainTextKey), material.keyHash);
  assert.equal(material.prefix.length, 12);
});

test('validateApiKeyScopes defaults and trims', () => {
  assert.deepEqual(validateApiKeyScopes(' send:create , send:read '), ['send:create', 'send:read']);
  assert.deepEqual(validateApiKeyScopes([]), ['send:create', 'send:read']);
});

test('isProjectAllowed wildcard and explicit project', () => {
  const wildcard = { allowedProjects: ['*'] };
  const specific = { allowedProjects: ['billing'] };
  assert.equal(isProjectAllowed(wildcard, 'anything'), true);
  assert.equal(isProjectAllowed(specific, 'billing'), true);
  assert.equal(isProjectAllowed(specific, 'other'), false);
  assert.equal(isProjectAllowed(specific, ''), false);
});

test('hasRequiredScopes requires every scope', () => {
  const apiKey = { scopes: ['send:create', 'send:read'] };
  assert.equal(hasRequiredScopes(apiKey, ['send:create']), true);
  assert.equal(hasRequiredScopes(apiKey, ['send:create', 'send:read']), true);
  assert.equal(hasRequiredScopes(apiKey, ['send:direct']), false);
});
