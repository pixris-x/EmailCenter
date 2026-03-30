const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

// 统一封装管理员密码校验与 JWT 生成，方便登录和接口鉴权复用。
function verifyAdminPassword(plainTextPassword, passwordHash) {
  return bcrypt.compare(plainTextPassword, passwordHash);
}

function buildAdminTokenPayload(adminUser) {
  return {
    adminId: adminUser.id,
    email: adminUser.email,
    displayName: adminUser.displayName,
    roleCode: adminUser.roleCode,
  };
}

function signAdminAccessToken(adminUser) {
  return jwt.sign(buildAdminTokenPayload(adminUser), env.app.jwtSecret, {
    expiresIn: env.app.jwtExpiresIn,
  });
}

function verifyAdminAccessToken(token) {
  return jwt.verify(token, env.app.jwtSecret);
}

module.exports = {
  verifyAdminPassword,
  buildAdminTokenPayload,
  signAdminAccessToken,
  verifyAdminAccessToken,
};
