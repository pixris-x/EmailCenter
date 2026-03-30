const fs = require('node:fs');
const { sequelize } = require('../config/database');
const { initModels } = require('../models');
const {
  getAttachmentMaxBytes,
  isAllowedAttachment,
  persistAttachmentPart,
  deleteStoredAttachment,
  buildAttachmentDownloadPath,
  resolveAttachmentAbsolutePath,
} = require('../services/attachment-service');
const { recordAuditLog } = require('../services/audit-log-service');

function getModels() {
  return initModels(sequelize);
}

function getAdminAuditMeta(request) {
  return {
    actorType: 'admin',
    actorId: request.currentAdmin?.id || null,
    actorLabel: request.currentAdmin?.email || 'console',
  };
}

function serializeAttachment(item) {
  return {
    ...item.toJSON(),
    downloadPath: buildAttachmentDownloadPath(item.id),
  };
}

async function attachmentRoutes(app) {
  app.get('/send-requests/:id/attachments', async (request, reply) => {
    const { Attachment } = getModels();
    const items = await Attachment.findAll({
      where: { sendRequestId: request.params.id },
      order: [['created_at', 'DESC']],
    });

    return reply.send(items.map(serializeAttachment));
  });

  app.post('/send-requests/:id/attachments', async (request, reply) => {
    const { SendRequest, Attachment } = getModels();
    const sendRequest = await SendRequest.findByPk(request.params.id);

    if (!sendRequest) {
      return reply.status(404).send({ message: '发送申请不存在。' });
    }

    if (!request.isMultipart()) {
      return reply.status(400).send({ message: '请求格式必须为 multipart/form-data。' });
    }

    let part;

    try {
      part = await request.file();
    } catch (error) {
      return reply.status(400).send({
        message: `附件上传失败：${error.message}`,
      });
    }

    if (!part) {
      return reply.status(400).send({ message: '未接收到附件文件。' });
    }

    if (!isAllowedAttachment(part.filename, part.mimetype)) {
      part.file.resume();
      return reply.status(400).send({
        message: '附件类型不支持，仅允许 pdf、doc、docx、xls、xlsx、jpg、jpeg、png、zip。',
      });
    }

    let storedAttachment;

    try {
      storedAttachment = await persistAttachmentPart(part);
    } catch (error) {
      if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(400).send({
          message: `附件超过 ${Math.round(getAttachmentMaxBytes() / 1024 / 1024)}MB 限制。`,
        });
      }

      throw error;
    }

    const item = await Attachment.create({
      sendRequestId: sendRequest.id,
      originalName: storedAttachment.originalName,
      storedName: storedAttachment.storedName,
      mimeType: storedAttachment.mimeType,
      fileSizeBytes: storedAttachment.fileSizeBytes,
      storagePath: storedAttachment.storagePath,
      checksumSha256: storedAttachment.checksumSha256,
      uploadedByAdminId: request.currentAdmin?.id || null,
    });

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'attachment_uploaded',
      resourceType: 'attachment',
      resourceId: item.id,
      status: 'success',
      message: `附件 ${item.originalName} 上传成功。`,
      metadata: {
        sendRequestId: item.sendRequestId,
        mimeType: item.mimeType,
        fileSizeBytes: item.fileSizeBytes,
        storagePath: item.storagePath,
      },
    });

    return reply.status(201).send(serializeAttachment(item));
  });

  app.delete('/attachments/:id', async (request, reply) => {
    const { Attachment } = getModels();
    const item = await Attachment.findByPk(request.params.id);

    if (!item) {
      return reply.status(404).send({ message: '附件不存在。' });
    }

    await deleteStoredAttachment(item.storagePath);
    await item.destroy();

    await recordAuditLog({
      ...getAdminAuditMeta(request),
      eventType: 'attachment_deleted',
      resourceType: 'attachment',
      resourceId: item.id,
      status: 'success',
      message: `附件 ${item.originalName} 已删除。`,
      metadata: {
        sendRequestId: item.sendRequestId,
        storagePath: item.storagePath,
      },
    });

    return reply.send({ message: '附件删除成功。' });
  });

  app.get('/attachments/:id/download', async (request, reply) => {
    const { Attachment } = getModels();
    const item = await Attachment.findByPk(request.params.id);

    if (!item) {
      return reply.status(404).send({ message: '附件不存在。' });
    }

    const absolutePath = resolveAttachmentAbsolutePath(item.storagePath);

    if (!fs.existsSync(absolutePath)) {
      return reply.status(404).send({ message: '附件文件不存在，请检查存储目录。' });
    }

    reply.header('Content-Type', item.mimeType);
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(item.originalName)}"`);

    return reply.send(fs.createReadStream(absolutePath));
  });
}

module.exports = { attachmentRoutes };
