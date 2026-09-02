// 邮箱格式校验与收件人解析工具。
// 集中管理校验规则，供管理台发信、内部 API 与测试发信等入口复用。

const EMAIL_MAX_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmailAddress(email) {
  if (typeof email !== 'string') {
    return false;
  }

  const trimmed = email.trim();
  if (!trimmed || trimmed.length > EMAIL_MAX_LENGTH) {
    return false;
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return false;
  }

  const [local, domain] = trimmed.split('@');
  if (!local || !domain) {
    return false;
  }

  if (domain.length > 253
    || domain.startsWith('.')
    || domain.endsWith('.')
    || domain.includes('..')) {
    return false;
  }

  return true;
}

// 支持 "Name <email>"、纯邮箱、以及使用逗号或分号分隔的多个收件人。
function extractEmailAddresses(input) {
  if (Array.isArray(input)) {
    return input.flatMap((item) => extractEmailAddresses(item));
  }

  if (typeof input !== 'string' || !String(input).trim()) {
    return [];
  }

  return String(input)
    .split(/[,;]/)
    .map((part) => {
      const trimmed = String(part).trim();
      if (!trimmed) {
        return '';
      }

      const angleMatch = trimmed.match(/<([^<>]+)>/);
      return angleMatch ? angleMatch[1].trim() : trimmed;
    })
    .filter(Boolean);
}

// 解析并校验收件人列表；返回去重后的合法地址，遇到非法地址直接抛错。
function validateRecipientList(input, { field = 'recipients' } = {}) {
  const addresses = extractEmailAddresses(input);
  const invalid = addresses.filter((item) => !isValidEmailAddress(item));

  if (invalid.length) {
    throw new Error(`Invalid ${field} email address: ${invalid.join(', ')}`);
  }

  return [...new Set(addresses)];
}

// 归一化 Message-ID：去掉尖括号并统一小写，便于与 provider_message_id 比对。
function normalizeMessageId(value) {
  return String(value || '')
    .replace(/^</, '')
    .replace(/>$/, '')
    .trim()
    .toLowerCase();
}

module.exports = {
  isValidEmailAddress,
  extractEmailAddresses,
  validateRecipientList,
  normalizeMessageId,
};
