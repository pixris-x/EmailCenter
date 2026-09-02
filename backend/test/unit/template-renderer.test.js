const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderTemplateContent, renderEmailTemplate, getPayloadValue } = require('../../src/services/template-renderer');

test('renders simple variable substitution', () => {
  assert.equal(renderTemplateContent('Hello {{name}}!', { name: 'Alice' }), 'Hello Alice!');
});

test('supports nested dotted keys', () => {
  assert.equal(renderTemplateContent('Hi {{user.profile.name}}', { user: { profile: { name: 'Bob' } } }), 'Hi Bob');
});

test('missing value renders empty string', () => {
  assert.equal(renderTemplateContent('a{{missing}}b', {}), 'ab');
});

test('null value renders empty string', () => {
  assert.equal(renderTemplateContent('a{{x}}b', { x: null }), 'ab');
});

test('replaces all occurrences', () => {
  assert.equal(renderTemplateContent('{{a}}-{{a}}', { a: '1' }), '1-1');
});

test('getPayloadValue returns undefined for unknown path', () => {
  assert.equal(getPayloadValue({ a: { b: 1 } }, 'a.c'), undefined);
  assert.equal(getPayloadValue({}, 'x.y'), undefined);
});

test('renderEmailTemplate applies subject override', () => {
  const result = renderEmailTemplate(
    { subject: 'Base {{n}}', htmlContent: '<p>{{n}}</p>', textContent: '{{n}}' },
    { n: 'v' },
    'Override {{n}}',
  );
  assert.equal(result.subject, 'Override v');
  assert.equal(result.htmlContent, '<p>v</p>');
  assert.equal(result.textContent, 'v');
});
