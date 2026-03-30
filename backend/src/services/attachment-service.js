const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { env } = require('../config/env');

function getAttachmentMaxBytes() {
  return env.smtp.attachmentMaxMb * 1024 * 1024;
}

function sanitizeFileName(fileName = '') {
  const baseName = path.basename(fileName);
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return sanitized || 'attachment';
}

function getFileExtension(fileName = '') {
  return path.extname(fileName).toLowerCase();
}

function isAllowedAttachment(fileName, mimeType) {
  const extension = getFileExtension(fileName);
  const normalizedMimeType = String(mimeType || '').toLowerCase();

  return env.smtp.allowedAttachmentExtensions.includes(extension)
    && env.smtp.allowedAttachmentMimeTypes.includes(normalizedMimeType);
}

function buildStoredRelativePath(storedName) {
  return `${env.storage.attachmentDirRelative}/${storedName}`.replace(/\\/g, '/');
}

function resolveAttachmentAbsolutePath(storagePath) {
  if (!storagePath) {
    return env.storage.attachmentDir;
  }

  if (path.isAbsolute(storagePath)) {
    return storagePath;
  }

  return path.resolve(process.cwd(), storagePath);
}

async function ensureAttachmentDirectory() {
  await fs.mkdir(env.storage.attachmentDir, { recursive: true });
}

async function persistAttachmentPart(part) {
  await ensureAttachmentDirectory();

  const buffer = await part.toBuffer();
  const extension = getFileExtension(part.filename);
  const storedName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const absolutePath = path.join(env.storage.attachmentDir, storedName);
  const storagePath = buildStoredRelativePath(storedName);
  const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // 文件实际写入绝对目录，数据库中仅保存相对路径，便于跨环境迁移。
  await fs.writeFile(absolutePath, buffer);

  return {
    originalName: sanitizeFileName(part.filename),
    storedName,
    mimeType: part.mimetype,
    fileSizeBytes: buffer.length,
    storagePath,
    checksumSha256,
  };
}

async function deleteStoredAttachment(storagePath) {
  try {
    await fs.unlink(resolveAttachmentAbsolutePath(storagePath));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function buildAttachmentDownloadPath(attachmentId) {
  return `/attachments/${attachmentId}/download`;
}

module.exports = {
  getAttachmentMaxBytes,
  sanitizeFileName,
  getFileExtension,
  isAllowedAttachment,
  ensureAttachmentDirectory,
  persistAttachmentPart,
  deleteStoredAttachment,
  buildAttachmentDownloadPath,
  resolveAttachmentAbsolutePath,
};
