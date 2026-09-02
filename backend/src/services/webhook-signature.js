// Svix 标准 webhook 签名校验（Resend 使用）。
// 请求头：svix-id / svix-timestamp / svix-signature
// 待签消息为 `${id}.${timestamp}.${rawBody}`，使用 base64 解码后的 secret 做 HMAC-SHA256。

const crypto = require('node:crypto');

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// 计算期望签名，兼容「secret 为原始字节」与「secret 为 base64 编码」两种取法。
function computeExpectedSignatures(content, secret) {
  const stripped = String(secret).replace(/^whsec_/, '');
  const candidates = [];
  try {
    candidates.push(Buffer.from(stripped, 'base64'));
  } catch {
    // ignore
  }
  if (stripped) {
    candidates.push(Buffer.from(stripped, 'utf8'));
  }
  return candidates.map((key) => crypto.createHmac('sha256', key).update(content).digest('base64'));
}

/**
 * @param {object} opts
 * @param {string|Buffer} opts.rawBody 原始请求体字符串
 * @param {object} opts.headers 请求头（小写键可用）
 * @param {string} opts.secret  webhook secret（whsec_...）
 * @param {number} [opts.timestampTolerance] 时间戳容差秒数，默认 300
 * @returns {{valid: boolean, reason?: string}}
 */
function verifyWebhookSignature({ rawBody, headers, secret, timestampTolerance = 300 }) {
  if (!secret) {
    // 未配置密钥：仅开发场景允许通过，调用方应打日志。
    return { valid: true, reason: 'no-secret-configured' };
  }

  const getHeader = (name) => {
    const ink = String(name).toLowerCase();
    const direct = headers[ink] ?? headers[name];
    if (direct !== undefined) {
      return String(direct);
    }
    for (const key of Object.keys(headers)) {
      if (String(key).toLowerCase() === ink) {
        return String(headers[key]);
      }
    }
    return undefined;
  };

  const id = getHeader('svix-id');
  const timestamp = getHeader('svix-timestamp');
  const signatureHeader = getHeader('svix-signature');
  if (!id || !timestamp || !signatureHeader) {
    return { valid: false, reason: 'missing-svix-headers' };
  }

  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > timestampTolerance) {
    return { valid: false, reason: 'invalid-or-stale-timestamp' };
  }

  const content = `${id}.${timestamp}.${String(rawBody)}`;
  const expected = computeExpectedSignatures(content, secret);

  for (const token of String(signatureHeader).split(' ')) {
    const versionMatch = String(token).match(/^v1[,=](.+)$/);
    if (!versionMatch) {
      continue;
    }
    const supplied = versionMatch[1];
    if (expected.some((sig) => timingSafeEqual(sig, supplied))) {
      return { valid: true };
    }
  }

  return { valid: false, reason: 'signature-mismatch' };
}

module.exports = { verifyWebhookSignature };
